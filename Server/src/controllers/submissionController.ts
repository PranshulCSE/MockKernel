import type { Request, Response } from 'express';
import { Types, type QueryFilter } from 'mongoose';
import { getAuthUser } from '../middleware/auth.js';
import { Contest } from '../models/Contest.js';
import { ContestParticipant } from '../models/ContestParticipant.js';
import {
  Problem,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from '../models/Problem.js';
import {
  SUBMISSION_MODES,
  SUBMISSION_VERDICTS,
  Submission,
  type ISubmission,
  type SubmissionDocument,
  type SubmissionMode,
  type SubmissionVerdict,
} from '../models/Submission.js';
import { TestCase } from '../models/TestCase.js';
import { enqueueSubmission } from '../queues/submissionQueue.js';
import { HttpError } from '../utils/http.js';
import {
  getPagination,
  isRecord,
  parseObjectId,
  parsePaginationQuery,
  readQueryString,
  readString,
} from '../utils/request.js';

const MAX_SOURCE_CODE_BYTES = 100 * 1024;
const MAX_ACTIVE_SUBMISSIONS_PER_USER = 5;

function parseMode(value: unknown): SubmissionMode {
  if (
    typeof value !== 'string' ||
    !(SUBMISSION_MODES as readonly string[]).includes(value)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `mode must be one of: ${SUBMISSION_MODES.join(', ')}.`
    );
  }
  return value as SubmissionMode;
}

function parseLanguage(value: unknown): SupportedLanguage {
  if (
    typeof value !== 'string' ||
    !(SUPPORTED_LANGUAGES as readonly string[]).includes(value)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}.`
    );
  }
  return value as SupportedLanguage;
}

function parseVerdict(value: string): SubmissionVerdict {
  if (!(SUBMISSION_VERDICTS as readonly string[]).includes(value)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `verdict must be one of: ${SUBMISSION_VERDICTS.join(', ')}.`
    );
  }
  return value as SubmissionVerdict;
}

function formatTestCaseResults(submission: SubmissionDocument, isAdmin: boolean) {
  if (!submission.testCaseResults) {
    return undefined;
  }

  const exposeOutputs = submission.mode === 'run' || isAdmin;
  return submission.testCaseResults.map((r) => ({
    testCase: r.testCase.toString(),
    passed: r.passed,
    ...(r.verdict !== undefined ? { verdict: r.verdict } : {}),
    ...(r.runtime !== undefined ? { runtime: r.runtime } : {}),
    ...(r.memory !== undefined ? { memory: r.memory } : {}),
    ...(exposeOutputs && r.stdout !== undefined ? { stdout: r.stdout } : {}),
    ...(exposeOutputs && r.stderr !== undefined ? { stderr: r.stderr } : {}),
  }));
}

export function toSubmissionResponse(submission: SubmissionDocument, isAdmin: boolean) {
  return {
    id: submission.id,
    submissionId: submission.id,
    user: submission.user.toString(),
    problem: submission.problem.toString(),
    ...(submission.contest ? { contest: submission.contest.toString() } : {}),
    language: submission.language,
    mode: submission.mode,
    verdict: submission.verdict,
    ...(submission.runtime !== undefined ? { runtime: submission.runtime } : {}),
    ...(submission.memory !== undefined ? { memory: submission.memory } : {}),
    ...(submission.compileOutput !== undefined
      ? { compileOutput: submission.compileOutput }
      : {}),
    ...(submission.testCaseResults !== undefined
      ? { testCaseResults: formatTestCaseResults(submission, isAdmin) }
      : {}),
    ...(isAdmin && submission.plagiarism
      ? { plagiarism: submission.plagiarism }
      : {}),
    createdAt: submission.createdAt,
    updatedAt: submission.updatedAt,
  };
}

async function handleCreateSubmission(
  req: Request,
  res: Response,
  forcedMode?: SubmissionMode
): Promise<void> {
  const authUser = getAuthUser(req);
  const body = req.body as unknown;
  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const problemId = parseObjectId(body.problemId, 'problemId');
  const language = parseLanguage(body.language);
  const mode = forcedMode ?? parseMode(body.mode);
  const sourceCode = readString(body.sourceCode, 'sourceCode', {
    min: 1,
    trim: false,
  });

  if (Buffer.byteLength(sourceCode, 'utf8') > MAX_SOURCE_CODE_BYTES) {
    throw new HttpError(
      400,
      'SOURCE_TOO_LARGE',
      'sourceCode exceeds the 100KB limit.'
    );
  }

  const problem = await Problem.findOne({
    _id: problemId,
    isPublished: true,
  })
    .select('supportedLanguages')
    .lean()
    .exec();

  if (!problem) {
    throw new HttpError(404, 'PROBLEM_NOT_FOUND', 'Problem not found.');
  }

  if (!problem.supportedLanguages.includes(language)) {
    throw new HttpError(
      400,
      'UNSUPPORTED_LANGUAGE',
      `Language "${language}" is not enabled for this problem.`
    );
  }

  let contestId: Types.ObjectId | undefined;
  if (body.contestId !== undefined) {
    contestId = parseObjectId(body.contestId, 'contestId');
    const contest = await Contest.findById(contestId)
      .select('status startTime endTime problems')
      .lean()
      .exec();

    if (!contest) {
      throw new HttpError(404, 'CONTEST_NOT_FOUND', 'Contest not found.');
    }

    const now = new Date();
    if (
      contest.status !== 'live' ||
      now < contest.startTime ||
      now > contest.endTime
    ) {
      throw new HttpError(
        403,
        'CONTEST_NOT_LIVE',
        'Submissions are only accepted while the contest is live.'
      );
    }

    const inContest = contest.problems.some(
      (p) => p.problem.toString() === problemId.toString()
    );
    if (!inContest) {
      throw new HttpError(
        400,
        'PROBLEM_NOT_IN_CONTEST',
        'This problem does not belong to the specified contest.'
      );
    }

    const participant = await ContestParticipant.findOne({
      contest: contestId,
      user: new Types.ObjectId(authUser.id),
    })
      .select('isDisqualified')
      .lean()
      .exec();

    if (!participant) {
      throw new HttpError(
        403,
        'NOT_CONTEST_PARTICIPANT',
        'You must join the contest before submitting.'
      );
    }

    if (participant.isDisqualified) {
      throw new HttpError(
        403,
        'PARTICIPANT_DISQUALIFIED',
        'Disqualified participants cannot submit to this contest.'
      );
    }
  }

  const activeCount = await Submission.countDocuments({
    user: new Types.ObjectId(authUser.id),
    verdict: { $in: ['PENDING', 'RUNNING'] },
  }).exec();

  if (activeCount >= MAX_ACTIVE_SUBMISSIONS_PER_USER) {
    throw new HttpError(
      429,
      'TOO_MANY_PENDING_SUBMISSIONS',
      'Too many submissions currently running. Please wait for results.'
    );
  }

  const testCases = await TestCase.find({
    problem: problemId,
    ...(mode === 'run' ? { isSample: true } : {}),
  })
    .sort({ order: 1 })
    .select('_id input expectedOutput')
    .lean()
    .exec();

  if (testCases.length === 0) {
    throw new HttpError(
      409,
      'NO_TEST_CASES',
      mode === 'run'
        ? 'This problem has no sample test cases configured to run.'
        : 'This problem has no configured test cases for evaluation.'
    );
  }

  const submission = await Submission.create({
    user: new Types.ObjectId(authUser.id),
    problem: problemId,
    ...(contestId ? { contest: contestId } : {}),
    language,
    sourceCode,
    mode,
    verdict: 'PENDING',
  });

  try {
    await enqueueSubmission({
      submissionId: submission.id,
      testCases: testCases.map((tc) => ({
        testCaseId: tc._id.toString(),
        input: tc.input,
        expectedOutput: tc.expectedOutput,
      })),
    });
  } catch (err) {
    submission.verdict = 'INTERNAL_ERROR';
    submission.compileOutput = 'Failed to enqueue submission job';
    await submission.save();
    throw err;
  }

  res.status(202).json({
    data: {
      id: submission.id,
      submissionId: submission.id,
      user: submission.user.toString(),
      problem: submission.problem.toString(),
      ...(submission.contest ? { contest: submission.contest.toString() } : {}),
      language: submission.language,
      mode: submission.mode,
      verdict: submission.verdict,
      createdAt: submission.createdAt,
    },
  });
}

/** POST /api/submissions */
export async function createSubmission(req: Request, res: Response): Promise<void> {
  await handleCreateSubmission(req, res);
}

/** POST /api/submissions/run */
export async function runCode(req: Request, res: Response): Promise<void> {
  await handleCreateSubmission(req, res, 'run');
}

/** POST /api/submissions/submit */
export async function submitCode(req: Request, res: Response): Promise<void> {
  await handleCreateSubmission(req, res, 'submit');
}

/** GET /api/submissions/:id */
export async function getSubmission(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const submissionId = parseObjectId(req.params.id, 'Submission id');

  const submission = await Submission.findById(submissionId).exec();
  if (!submission) {
    throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
  }

  const isAdmin = authUser.role === 'admin' || authUser.role === 'superadmin';
  if (submission.user.toString() !== authUser.id && !isAdmin) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'You do not have permission to view this submission.'
    );
  }

  res.status(200).json({
    data: toSubmissionResponse(submission, isAdmin),
  });
}

/** GET /api/submissions/:id/status */
export async function getSubmissionStatus(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const submissionId = parseObjectId(req.params.id, 'Submission id');

  const submission = await Submission.findById(submissionId).exec();
  if (!submission) {
    throw new HttpError(404, 'SUBMISSION_NOT_FOUND', 'Submission not found.');
  }

  const isAdmin = authUser.role === 'admin' || authUser.role === 'superadmin';
  if (submission.user.toString() !== authUser.id && !isAdmin) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'You do not have permission to view this submission.'
    );
  }

  const testCaseResults = formatTestCaseResults(submission, isAdmin);
  res.status(200).json({
    data: {
      id: submission.id,
      submissionId: submission.id,
      mode: submission.mode,
      verdict: submission.verdict,
      ...(submission.runtime !== undefined ? { runtime: submission.runtime } : {}),
      ...(submission.memory !== undefined ? { memory: submission.memory } : {}),
      ...(submission.compileOutput !== undefined
        ? { compileOutput: submission.compileOutput }
        : {}),
      ...(testCaseResults !== undefined ? { testCaseResults } : {}),
      updatedAt: submission.updatedAt,
    },
  });
}

/** GET /api/submissions */
export async function listSubmissions(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const isAdmin = authUser.role === 'admin' || authUser.role === 'superadmin';

  const filter: QueryFilter<ISubmission> = {
    user: new Types.ObjectId(authUser.id),
  };

  const problemId = readQueryString(req.query.problemId, 'problemId');
  if (problemId) {
    filter.problem = parseObjectId(problemId, 'problemId');
  }

  const contestId = readQueryString(req.query.contestId, 'contestId');
  if (contestId) {
    filter.contest = parseObjectId(contestId, 'contestId');
  }

  const mode = readQueryString(req.query.mode, 'mode');
  if (mode) {
    filter.mode = parseMode(mode);
  }

  const verdict = readQueryString(req.query.verdict, 'verdict');
  if (verdict) {
    filter.verdict = parseVerdict(verdict);
  }

  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Submission.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: submissions.map((s) => toSubmissionResponse(s, isAdmin)),
    pagination: getPagination(page, limit, total),
  });
}
