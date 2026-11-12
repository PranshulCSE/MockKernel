import type { Request, Response } from 'express';
import { isValidObjectId, Types, type ClientSession, type QueryFilter } from 'mongoose';
import { getAuthUser } from '../middleware/auth.js';
import { Contest } from '../models/Contest.js';
import {
  DIFFICULTIES,
  Problem,
  SUPPORTED_LANGUAGES,
  type Difficulty,
  type IProblem,
  type ProblemDocument,
  type SupportedLanguage,
} from '../models/Problem.js';
import { TestCase, type TestCaseDocument } from '../models/TestCase.js';
import { HttpError } from '../utils/http.js';
import {
  escapeRegex,
  getPagination,
  hasOwn,
  isRecord,
  parsePaginationQuery,
  readBoolean,
  readInteger,
  readQueryString,
  readString,
} from '../utils/request.js';
import { runInTransaction } from '../utils/transaction.js';

type TestCaseInput = {
  input: string;
  expectedOutput: string;
  isSample: boolean;
  order: number;
  explanation?: string;
};

type ProblemCreateInput = {
  title: string;
  statement: string;
  difficulty: Difficulty;
  constraints: string;
  supportedLanguages: SupportedLanguage[];
  starterCode?: Partial<Record<SupportedLanguage, string>>;
  isPublished: boolean;
};

type ProblemUpdateInput = Partial<ProblemCreateInput>;

type ListOptions = {
  page: number;
  limit: number;
  filter: QueryFilter<IProblem>;
};

const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 150;
const STATEMENT_MAX_LENGTH = 50_000;
const CONSTRAINTS_MAX_LENGTH = 10_000;
const TEST_CASE_TEXT_MAX_LENGTH = 1_000_000;
const EXPLANATION_MAX_LENGTH = 10_000;
const STARTER_CODE_MAX_LENGTH = 50_000;

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

function parseDifficulty(value: unknown): Difficulty {
  if (
    typeof value !== 'string' ||
    !(DIFFICULTIES as readonly string[]).includes(value)
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `difficulty must be one of: ${DIFFICULTIES.join(', ')}.`
    );
  }
  return value as Difficulty;
}

function parseSupportedLanguages(value: unknown): SupportedLanguage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'supportedLanguages must be a non-empty array.'
    );
  }

  const result: SupportedLanguage[] = [];
  for (const language of value) {
    if (typeof language !== 'string' || !isSupportedLanguage(language)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `supportedLanguages contains an unsupported language. Allowed values: ${SUPPORTED_LANGUAGES.join(', ')}.`
      );
    }
    if (result.includes(language)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `supportedLanguages contains duplicate value "${language}".`
      );
    }
    result.push(language);
  }
  return result;
}

function parseStarterCode(
  value: unknown,
  supportedLanguages: SupportedLanguage[]
): Partial<Record<SupportedLanguage, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'starterCode must be an object keyed by supported language.'
    );
  }

  const allowedLanguages = new Set(supportedLanguages);
  const result: Partial<Record<SupportedLanguage, string>> = {};

  for (const [language, starterCode] of Object.entries(value)) {
    if (!isSupportedLanguage(language)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `starterCode contains an unsupported language "${language}".`
      );
    }
    if (!allowedLanguages.has(language)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `starterCode language "${language}" is not present in supportedLanguages.`
      );
    }
    if (typeof starterCode !== 'string' || starterCode.length > STARTER_CODE_MAX_LENGTH) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `starterCode.${language} must be a string within ${STARTER_CODE_MAX_LENGTH} characters.`
      );
    }
    result[language] = starterCode;
  }

  return result;
}

function parseTestCases(value: unknown): TestCaseInput[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'testCases must be an array.');
  }

  const seenOrders = new Set<number>();

  const parsed = value.map((testCase, index) => {
    if (!isRecord(testCase)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `testCases[${index}] must be an object.`
      );
    }

    const prefix = `testCases[${index}]`;
    // Empty string ('') is valid for both input and expectedOutput.
    const input = readString(testCase.input ?? '', `${prefix}.input`, {
      min: 0,
      trim: false,
      max: TEST_CASE_TEXT_MAX_LENGTH,
    });
    const expectedOutput = readString(
      testCase.expectedOutput,
      `${prefix}.expectedOutput`,
      { min: 0, trim: false, max: TEST_CASE_TEXT_MAX_LENGTH }
    );
    const isSample = readBoolean(testCase.isSample, `${prefix}.isSample`);
    const order = readInteger(testCase.order, `${prefix}.order`, 0);

    if (seenOrders.has(order)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Duplicate test case order ${order} in testCases.`
      );
    }
    seenOrders.add(order);

    let explanation: string | undefined;
    if (hasOwn(testCase, 'explanation') && testCase.explanation !== undefined) {
      explanation = readString(testCase.explanation, `${prefix}.explanation`, {
        min: 0,
        max: EXPLANATION_MAX_LENGTH,
      });
    }

    return {
      input,
      expectedOutput,
      isSample,
      order,
      ...(explanation !== undefined ? { explanation } : {}),
    };
  });

  return parsed.sort((a, b) => a.order - b.order);
}

function parseProblemCreateInput(body: unknown): {
  input: ProblemCreateInput;
  testCases: TestCaseInput[];
} {
  if (!isRecord(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.'
    );
  }

  const supportedLanguages = parseSupportedLanguages(body.supportedLanguages);
  const input: ProblemCreateInput = {
    title: readString(body.title, 'title', {
      min: TITLE_MIN_LENGTH,
      max: TITLE_MAX_LENGTH,
    }),
    statement: readString(body.statement, 'statement', {
      max: STATEMENT_MAX_LENGTH,
    }),
    difficulty: parseDifficulty(body.difficulty),
    constraints: readString(body.constraints, 'constraints', {
      max: CONSTRAINTS_MAX_LENGTH,
    }),
    supportedLanguages,
    isPublished: hasOwn(body, 'isPublished')
      ? readBoolean(body.isPublished, 'isPublished')
      : false,
  };

  const starterCode = parseStarterCode(body.starterCode, supportedLanguages);
  if (starterCode !== undefined) {
    input.starterCode = starterCode;
  }

  const testCases = hasOwn(body, 'testCases')
    ? parseTestCases(body.testCases)
    : [];

  return { input, testCases };
}

function parseProblemUpdateInput(
  body: unknown,
  existingLanguages: SupportedLanguage[]
): { input: ProblemUpdateInput; testCases: TestCaseInput[] | undefined } {
  if (!isRecord(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.'
    );
  }

  const input: ProblemUpdateInput = {};
  let supportedLanguages = existingLanguages;

  if (hasOwn(body, 'supportedLanguages')) {
    supportedLanguages = parseSupportedLanguages(body.supportedLanguages);
    input.supportedLanguages = supportedLanguages;
  }

  if (hasOwn(body, 'title')) {
    input.title = readString(body.title, 'title', {
      min: TITLE_MIN_LENGTH,
      max: TITLE_MAX_LENGTH,
    });
  }

  if (hasOwn(body, 'statement')) {
    input.statement = readString(body.statement, 'statement', {
      max: STATEMENT_MAX_LENGTH,
    });
  }

  if (hasOwn(body, 'difficulty')) {
    input.difficulty = parseDifficulty(body.difficulty);
  }

  if (hasOwn(body, 'constraints')) {
    input.constraints = readString(body.constraints, 'constraints', {
      max: CONSTRAINTS_MAX_LENGTH,
    });
  }

  if (hasOwn(body, 'starterCode')) {
    const starterCode = parseStarterCode(body.starterCode, supportedLanguages);
    if (starterCode !== undefined) {
      input.starterCode = starterCode;
    }
  }

  if (hasOwn(body, 'isPublished')) {
    input.isPublished = readBoolean(body.isPublished, 'isPublished');
  }

  const testCases = hasOwn(body, 'testCases')
    ? parseTestCases(body.testCases)
    : undefined;

  if (Object.keys(input).length === 0 && testCases === undefined) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'At least one problem field or testCases must be provided.'
    );
  }

  return { input, testCases };
}

function parseListOptions(req: Request, includeUnpublished: boolean): ListOptions {
  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const filter: QueryFilter<IProblem> = {};

  if (!includeUnpublished) {
    filter.isPublished = true;
  }

  const search = readQueryString(req.query.search, 'search');
  if (search) {
    filter.title = {
      $regex: escapeRegex(search),
      $options: 'i',
    };
  }

  const difficulty = readQueryString(req.query.difficulty, 'difficulty');
  if (difficulty) {
    filter.difficulty = parseDifficulty(difficulty);
  }

  if (includeUnpublished) {
    const isPublished = readQueryString(req.query.isPublished, 'isPublished');
    if (isPublished !== undefined && isPublished !== '') {
      if (isPublished !== 'true' && isPublished !== 'false') {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'isPublished must be either "true" or "false".'
        );
      }
      filter.isPublished = isPublished === 'true';
    }

    const createdBy = readQueryString(req.query.createdBy, 'createdBy');
    if (createdBy) {
      if (!isValidObjectId(createdBy)) {
        throw new HttpError(
          400,
          'VALIDATION_ERROR',
          'createdBy must be a valid MongoDB ObjectId.'
        );
      }
      filter.createdBy = new Types.ObjectId(createdBy);
    }
  }

  return { page, limit, filter };
}

function toPublicSummary(problem: ProblemDocument) {
  return {
    id: problem.id,
    title: problem.title,
    difficulty: problem.difficulty,
    supportedLanguages: problem.supportedLanguages,
    createdAt: problem.createdAt,
  };
}

function toPublicProblem(problem: ProblemDocument) {
  return {
    ...toPublicSummary(problem),
    statement: problem.statement,
    constraints: problem.constraints,
    starterCode: problem.starterCode,
    updatedAt: problem.updatedAt,
  };
}

function toAdminProblem(problem: ProblemDocument) {
  return {
    ...toPublicProblem(problem),
    isPublished: problem.isPublished,
    createdBy: problem.createdBy.toString(),
  };
}

function toTestCaseResponse(testCase: TestCaseDocument) {
  return {
    id: testCase.id,
    input: testCase.input,
    expectedOutput: testCase.expectedOutput,
    isSample: testCase.isSample,
    order: testCase.order,
    ...(testCase.explanation !== undefined
      ? { explanation: testCase.explanation }
      : {}),
  };
}

async function findProblemOrThrow(
  id: unknown,
  session?: ClientSession
): Promise<ProblemDocument> {
  if (typeof id !== 'string' || !isValidObjectId(id)) {
    throw new HttpError(
      400,
      'INVALID_ID',
      'Problem id is not a valid MongoDB ObjectId.'
    );
  }

  const query = Problem.findById(id);
  if (session) {
    query.session(session);
  }
  const problem = await query.exec();
  if (!problem) {
    throw new HttpError(404, 'PROBLEM_NOT_FOUND', 'Problem not found.');
  }

  return problem;
}

async function findPublishedProblemOrThrow(
  id: unknown
): Promise<ProblemDocument> {
  if (typeof id !== 'string' || !isValidObjectId(id)) {
    throw new HttpError(
      400,
      'INVALID_ID',
      'Problem id is not a valid MongoDB ObjectId.'
    );
  }

  const problem = await Problem.findOne({ _id: id, isPublished: true }).exec();
  if (!problem) {
    throw new HttpError(404, 'PROBLEM_NOT_FOUND', 'Problem not found.');
  }

  return problem;
}

async function sendAdminProblem(
  res: Response,
  problem: ProblemDocument,
  statusCode = 200
): Promise<void> {
  const testCases = await TestCase.find({ problem: problem._id })
    .sort({ order: 1 })
    .exec();

  res.status(statusCode).json({
    data: {
      ...toAdminProblem(problem),
      testCases: testCases.map(toTestCaseResponse),
    },
  });
}

async function insertTestCases(
  problemId: Types.ObjectId,
  testCases: TestCaseInput[],
  session?: ClientSession
): Promise<void> {
  if (testCases.length === 0) {
    return;
  }

  const docs = testCases.map((testCase) => ({
    ...testCase,
    problem: problemId,
  }));

  await TestCase.insertMany(docs, session ? { session } : {});
}

export async function listPublicProblems(
  req: Request,
  res: Response
): Promise<void> {
  const { page, limit, filter } = parseListOptions(req, false);

  const [problems, total] = await Promise.all([
    Problem.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Problem.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: problems.map(toPublicSummary),
    pagination: getPagination(page, limit, total),
  });
}

export async function getPublicProblem(
  req: Request,
  res: Response
): Promise<void> {
  const problem = await findPublishedProblemOrThrow(req.params.id);
  const sampleTestCases = await TestCase.find({
    problem: problem._id,
    isSample: true,
  })
    .sort({ order: 1 })
    .exec();

  res.status(200).json({
    data: {
      ...toPublicProblem(problem),
      sampleTestCases: sampleTestCases.map(toTestCaseResponse),
    },
  });
}

export async function listAdminProblems(
  req: Request,
  res: Response
): Promise<void> {
  const { page, limit, filter } = parseListOptions(req, true);

  const [problems, total] = await Promise.all([
    Problem.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Problem.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: problems.map(toAdminProblem),
    pagination: getPagination(page, limit, total),
  });
}

export async function getAdminProblem(
  req: Request,
  res: Response
): Promise<void> {
  const problem = await findProblemOrThrow(req.params.id);
  await sendAdminProblem(res, problem);
}

export async function createProblem(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const { input, testCases } = parseProblemCreateInput(req.body as unknown);

  const problem = await runInTransaction(
    async (session) => {
      const created = new Problem({
        ...input,
        createdBy: new Types.ObjectId(authUser.id),
      });
      await created.save(session ? { session } : {});
      await insertTestCases(created._id, testCases, session);
      return created;
    },
    async () => {
      const created = new Problem({
        ...input,
        createdBy: new Types.ObjectId(authUser.id),
      });
      await created.save();
      try {
        await insertTestCases(created._id, testCases);
      } catch (error) {
        await Problem.findByIdAndDelete(created._id).exec();
        throw error;
      }
      return created;
    }
  );

  await sendAdminProblem(res, problem, 201);
}

export async function updateProblem(
  req: Request,
  res: Response
): Promise<void> {
  const existingProblem = await findProblemOrThrow(req.params.id);
  const { input, testCases } = parseProblemUpdateInput(
    req.body as unknown,
    existingProblem.supportedLanguages
  );

  const nextLanguages = input.supportedLanguages;
  if (nextLanguages && existingProblem.starterCode) {
    const invalidLanguages = Object.keys(existingProblem.starterCode).filter(
      (language) => !nextLanguages.includes(language as SupportedLanguage)
    );
    if (invalidLanguages.length > 0) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `starterCode contains languages that are no longer supported: ${invalidLanguages.join(', ')}.`
      );
    }
  }

  const updatedProblem = await runInTransaction(
    async (session) => {
      const problem = await findProblemOrThrow(req.params.id, session);
      problem.set(input);
      await problem.save(session ? { session } : {});

      if (testCases !== undefined) {
        await TestCase.deleteMany(
          { problem: problem._id },
          session ? { session } : {}
        ).exec();
        await insertTestCases(problem._id, testCases, session);
      }
      return problem;
    },
    async () => {
      const problem = await findProblemOrThrow(req.params.id);
      const previousTestCases =
        testCases !== undefined
          ? (await TestCase.find({ problem: problem._id }).lean().exec()).map((tc) => ({
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              isSample: tc.isSample,
              order: tc.order,
              ...(tc.explanation !== undefined ? { explanation: tc.explanation } : {}),
            }))
          : [];

      problem.set(input);
      await problem.save();

      if (testCases !== undefined) {
        await TestCase.deleteMany({ problem: problem._id }).exec();
        try {
          await insertTestCases(problem._id, testCases);
        } catch (error) {
          if (previousTestCases.length > 0) {
            await insertTestCases(problem._id, previousTestCases).catch(() => {});
          }
          throw error;
        }
      }
      return problem;
    }
  );

  await sendAdminProblem(res, updatedProblem);
}

export async function deleteProblem(
  req: Request,
  res: Response
): Promise<void> {
  await runInTransaction(async (session) => {
    const problem = await findProblemOrThrow(req.params.id, session);

    const liveContestQuery = Contest.exists({
      status: 'live',
      'problems.problem': problem._id,
    });
    if (session) {
      liveContestQuery.session(session);
    }
    const liveContest = await liveContestQuery.exec();

    if (liveContest) {
      throw new HttpError(
        409,
        'PROBLEM_IN_LIVE_CONTEST',
        'Cannot delete a problem that is part of a live contest.'
      );
    }

    await TestCase.deleteMany(
      { problem: problem._id },
      session ? { session } : {}
    ).exec();
    await Problem.deleteOne(
      { _id: problem._id },
      session ? { session } : {}
    ).exec();
  });

  res.status(204).send();
}
