import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { getAuthUser, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  Assessment,
  type AssessmentDocument,
  type IAssessment,
} from '../models/Assessment.js';
import {
  AssessmentSession,
  type AssessmentSessionDocument,
  type IAssessmentSession,
} from '../models/AssessmentSession.js';
import { Problem } from '../models/Problem.js';
import { User } from '../models/User.js';
import { analyzeFrame } from '../services/geminiProctorService.js';
import { HttpError } from '../utils/http.js';
import {
  isRecord,
  parseObjectId,
  readDate,
  readInteger,
  readString,
} from '../utils/request.js';

/** Generates a 4-character random uppercase alphanumeric string */
function generateCodeSuffix(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous 0, O, 1, I
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/** Admin: Create new assessment with optional on-the-fly custom problem creation */
export async function createAssessment(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const body = req.body;

  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be an object.');
  }

  const title = readString(body.title, 'title', { min: 3, max: 150 });
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const durationMinutes = readInteger(body.durationMinutes, 'durationMinutes', {
    min: 5,
    max: 1440,
  });
  const startTime = readDate(body.startTime, 'startTime');
  const endTime = readDate(body.endTime, 'endTime');

  if (endTime.getTime() <= startTime.getTime()) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'endTime must be strictly after startTime.');
  }

  // Handle unique code generation or custom code
  let code = typeof body.code === 'string' && body.code.trim().length > 0
    ? body.code.trim().toUpperCase()
    : '';

  if (!code) {
    let attempts = 0;
    while (attempts < 10) {
      const candidate = `MOCK-${generateCodeSuffix()}`;
      const existing = await Assessment.findOne({ code: candidate }).lean();
      if (!existing) {
        code = candidate;
        break;
      }
      attempts++;
    }
    if (!code) {
      code = `MOCK-${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }
  }

  const problemIds: Types.ObjectId[] = [];

  // Existing selected problems
  if (Array.isArray(body.problemIds)) {
    for (const pid of body.problemIds) {
      if (typeof pid === 'string' && Types.ObjectId.isValid(pid)) {
        problemIds.push(new Types.ObjectId(pid));
      }
    }
  }

  // Handle on-the-fly custom private problems
  if (Array.isArray(body.customProblems) && body.customProblems.length > 0) {
    for (const custom of body.customProblems) {
      if (isRecord(custom) && typeof custom.title === 'string' && custom.title.trim().length >= 3) {
        const createdProblem = await Problem.create({
          title: custom.title.trim(),
          statement: typeof custom.statement === 'string' ? custom.statement.trim() : 'Problem statement',
          difficulty: custom.difficulty === 'Hard' ? 'Hard' : custom.difficulty === 'Medium' ? 'Medium' : 'Easy',
          constraints: typeof custom.constraints === 'string' ? custom.constraints.trim() : 'Standard constraints',
          supportedLanguages: ['python', 'cpp', 'java', 'javascript'],
          starterCode: isRecord(custom.starterCode) ? custom.starterCode : {
            python: 'def solution():\n    pass',
            javascript: 'function solution() {\n}',
          },
          createdBy: new Types.ObjectId(authUser.id),
          isPublished: false, // private problem created for this assessment
        });
        problemIds.push(createdProblem._id as Types.ObjectId);
      }
    }
  }

  const assessment = await Assessment.create({
    title,
    description,
    code,
    durationMinutes,
    startTime,
    endTime,
    problems: problemIds,
    allowCustomProblems: Boolean(body.allowCustomProblems),
    createdBy: new Types.ObjectId(authUser.id),
    status: 'ACTIVE',
  });

  res.status(201).json({
    data: assessment,
  });
}

/** Admin: List all assessments with candidate counts */
export async function getAdminAssessments(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);

  const assessments = await Assessment.find({
    $or: [{ createdBy: new Types.ObjectId(authUser.id) }, { status: { $in: ['ACTIVE', 'DRAFT', 'COMPLETED'] } }],
  })
    .sort({ createdAt: -1 })
    .lean();

  const assessmentIds = assessments.map((a) => a._id);
  const sessionCounts = await AssessmentSession.aggregate([
    { $match: { assessmentId: { $in: assessmentIds } } },
    { $group: { _id: '$assessmentId', totalCandidates: { $sum: 1 } } },
  ]);

  const countMap = new Map<string, number>();
  for (const item of sessionCounts) {
    countMap.set(item._id.toString(), item.totalCandidates);
  }

  const enriched = assessments.map((a) => ({
    ...a,
    id: a._id.toString(),
    candidateCount: countMap.get(a._id.toString()) || 0,
  }));

  res.status(200).json({
    data: enriched,
  });
}

/** Candidate: Join / Validate code and view instructions */
export async function joinAssessment(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const rawCode = req.params.code?.trim().toUpperCase();

  if (!rawCode) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Access code is required.');
  }

  const assessment = await Assessment.findOne({ code: rawCode })
    .populate({
      path: 'problems',
      select: 'title statement difficulty constraints starterCode supportedLanguages',
    })
    .lean();

  if (!assessment) {
    throw new HttpError(404, 'NOT_FOUND', `Assessment with code "${rawCode}" was not found.`);
  }

  const now = Date.now();
  const startMs = new Date(assessment.startTime).getTime();
  const endMs = new Date(assessment.endTime).getTime();

  let windowState: 'UPCOMING' | 'OPEN' | 'EXPIRED' = 'OPEN';
  if (now < startMs) {
    windowState = 'UPCOMING';
  } else if (now > endMs) {
    windowState = 'EXPIRED';
  }

  // Look up existing session for candidate if present
  const existingSession = await AssessmentSession.findOne({
    assessmentId: assessment._id,
    userId: new Types.ObjectId(authUser.id),
  }).lean();

  res.status(200).json({
    data: {
      id: assessment._id.toString(),
      title: assessment.title,
      description: assessment.description,
      code: assessment.code,
      durationMinutes: assessment.durationMinutes,
      startTime: assessment.startTime,
      endTime: assessment.endTime,
      windowState,
      problemCount: assessment.problems?.length || 0,
      problems: windowState === 'OPEN' ? assessment.problems : [],
      existingSession: existingSession
        ? {
            id: existingSession._id.toString(),
            status: existingSession.status,
            strikes: existingSession.strikes,
            startedAt: existingSession.startedAt,
            submittedAt: existingSession.submittedAt,
            codeSubmissions: existingSession.codeSubmissions,
          }
        : null,
    },
  });
}

/** Candidate: Start assessment session (lock in server timer) */
export async function startSession(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const assessmentId = parseObjectId(req.params.id, 'id');

  const assessment = await Assessment.findById(assessmentId)
    .populate({
      path: 'problems',
      select: 'title statement difficulty constraints starterCode supportedLanguages',
    })
    .lean();

  if (!assessment) {
    throw new HttpError(404, 'NOT_FOUND', 'Assessment not found.');
  }

  const now = new Date();
  if (now.getTime() > new Date(assessment.endTime).getTime()) {
    throw new HttpError(400, 'ASSESSMENT_EXPIRED', 'Assessment window has already concluded.');
  }

  // Check if session already exists
  let session = await AssessmentSession.findOne({
    assessmentId: assessment._id,
    userId: new Types.ObjectId(authUser.id),
  });

  if (session) {
    if (session.status !== 'IN_PROGRESS') {
      throw new HttpError(
        400,
        'SESSION_FINALIZED',
        `This assessment has already been finalized (${session.status}).`
      );
    }
  } else {
    session = await AssessmentSession.create({
      assessmentId: assessment._id,
      userId: new Types.ObjectId(authUser.id),
      status: 'IN_PROGRESS',
      startedAt: now,
      strikes: 0,
      codeSubmissions: new Map(),
      violationLogs: [],
    });
  }

  // Compute deadline
  const sessionStartMs = new Date(session.startedAt).getTime();
  const maxSessionEndMs = sessionStartMs + assessment.durationMinutes * 60 * 1000;
  const assessmentEndMs = new Date(assessment.endTime).getTime();
  const deadlineMs = Math.min(maxSessionEndMs, assessmentEndMs);

  res.status(200).json({
    data: {
      session: {
        id: session._id.toString(),
        assessmentId: assessment._id.toString(),
        status: session.status,
        strikes: session.strikes,
        startedAt: session.startedAt,
        codeSubmissions: session.codeSubmissions,
        violationLogs: session.violationLogs,
      },
      deadline: new Date(deadlineMs).toISOString(),
      durationMinutes: assessment.durationMinutes,
      problems: assessment.problems,
    },
  });
}

/** Candidate: Record a strike (e.g. fullscreen exit, tab switch) */
export async function recordStrike(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const assessmentId = parseObjectId(req.params.id, 'id');
  const body = req.body;

  const type = typeof body?.type === 'string' ? body.type : 'FOCUS_LOSS';
  const reason = typeof body?.reason === 'string' ? body.reason : 'Candidate switched tab or left fullscreen.';

  const session = await AssessmentSession.findOne({
    assessmentId,
    userId: new Types.ObjectId(authUser.id),
  });

  if (!session) {
    throw new HttpError(404, 'NOT_FOUND', 'Active assessment session not found.');
  }

  if (session.status !== 'IN_PROGRESS') {
    res.status(200).json({
      data: {
        strikes: session.strikes,
        status: session.status,
        autoSubmitted: true,
      },
    });
    return;
  }

  session.strikes = Math.min(3, session.strikes + 1);
  session.violationLogs.push({
    timestamp: new Date(),
    type,
    reason,
    confidence: 100,
  });

  let autoSubmitted = false;
  if (session.strikes >= 3) {
    session.status = 'AUTO_SUBMITTED_VIOLATION';
    session.submittedAt = new Date();
    autoSubmitted = true;
  }

  await session.save();

  res.status(200).json({
    data: {
      strikes: session.strikes,
      status: session.status,
      autoSubmitted,
      violationLogs: session.violationLogs,
    },
  });
}

/**
 * Fallback auto-submit compatible with navigator.sendBeacon.
 * Supports text/plain or JSON bodies, with or without Bearer headers.
 */
export async function autoSubmit(req: Request, res: Response): Promise<void> {
  const assessmentId = parseObjectId(req.params.id, 'id');

  let parsedBody: Record<string, unknown> = {};
  if (typeof req.body === 'string') {
    try {
      parsedBody = JSON.parse(req.body);
    } catch {
      parsedBody = {};
    }
  } else if (isRecord(req.body)) {
    parsedBody = req.body;
  }

  const reqAuth = (req as AuthenticatedRequest).authUser;
  let userIdStr = reqAuth?.id;

  if (!userIdStr && typeof parsedBody.userId === 'string' && Types.ObjectId.isValid(parsedBody.userId)) {
    userIdStr = parsedBody.userId;
  }

  let session: AssessmentSessionDocument | null = null;

  if (typeof parsedBody.sessionId === 'string' && Types.ObjectId.isValid(parsedBody.sessionId)) {
    session = await AssessmentSession.findById(parsedBody.sessionId);
  } else if (userIdStr) {
    session = await AssessmentSession.findOne({
      assessmentId,
      userId: new Types.ObjectId(userIdStr),
    });
  }

  if (!session) {
    res.status(200).json({ ok: false, message: 'Session not located' });
    return;
  }

  if (session.status === 'IN_PROGRESS') {
    const statusVal =
      parsedBody.status === 'AUTO_SUBMITTED_VIOLATION'
        ? 'AUTO_SUBMITTED_VIOLATION'
        : 'AUTO_SUBMITTED_PAGE_RELOAD';

    session.status = statusVal;
    session.submittedAt = new Date();

    const reason = typeof parsedBody.reason === 'string'
      ? parsedBody.reason
      : 'Candidate reloaded page, navigated away, or closed window.';

    session.violationLogs.push({
      timestamp: new Date(),
      type: 'PAGE_RELOAD_OR_CLOSE',
      reason,
      confidence: 100,
    });

    if (isRecord(parsedBody.codeSubmissions)) {
      for (const [probId, subData] of Object.entries(parsedBody.codeSubmissions)) {
        if (isRecord(subData) && typeof subData.code === 'string') {
          session.codeSubmissions.set(probId, {
            code: subData.code,
            language: typeof subData.language === 'string' ? subData.language : 'python',
            submittedAt: new Date(),
          });
        }
      }
    }

    await session.save();
  }

  res.status(200).json({ ok: true, status: session.status });
}

/** Candidate: Manual submit of assessment */
export async function submitAssessment(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const assessmentId = parseObjectId(req.params.id, 'id');
  const body = req.body;

  const session = await AssessmentSession.findOne({
    assessmentId,
    userId: new Types.ObjectId(authUser.id),
  });

  if (!session) {
    throw new HttpError(404, 'NOT_FOUND', 'Assessment session not found.');
  }

  if (session.status !== 'IN_PROGRESS') {
    throw new HttpError(400, 'SESSION_ALREADY_SUBMITTED', `Assessment is already finalized with status ${session.status}.`);
  }

  if (isRecord(body?.codeSubmissions)) {
    for (const [probId, subData] of Object.entries(body.codeSubmissions)) {
      if (isRecord(subData) && typeof subData.code === 'string') {
        session.codeSubmissions.set(probId, {
          code: subData.code,
          language: typeof subData.language === 'string' ? subData.language : 'python',
          submittedAt: new Date(),
          testCasesPassed: typeof subData.testCasesPassed === 'number' ? subData.testCasesPassed : 0,
          totalTestCases: typeof subData.totalTestCases === 'number' ? subData.totalTestCases : 0,
        });
      }
    }
  }

  session.status = 'SUBMITTED';
  session.submittedAt = new Date();

  // Calculate scores
  let totalPassed = 0;
  let totalCases = 0;
  for (const [, item] of session.codeSubmissions) {
    totalPassed += item.testCasesPassed || 0;
    totalCases += item.totalTestCases || 0;
  }
  session.testCasesPassed = totalPassed;
  session.totalTestCases = totalCases;
  session.score = totalCases > 0 ? Math.round((totalPassed / totalCases) * 100) : 100;

  await session.save();

  res.status(200).json({
    data: {
      id: session._id.toString(),
      status: session.status,
      score: session.score,
      testCasesPassed: session.testCasesPassed,
      totalTestCases: session.totalTestCases,
      submittedAt: session.submittedAt,
    },
  });
}

/** Candidate: Submit proctor frame for real-time Gemini AI surveillance */
export async function analyzeProctorFrame(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const assessmentId = parseObjectId(req.params.id, 'id');
  const body = req.body;

  if (!isRecord(body) || typeof body.frame !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'A base64 image frame is required.');
  }

  const session = await AssessmentSession.findOne({
    assessmentId,
    userId: new Types.ObjectId(authUser.id),
  });

  if (!session || session.status !== 'IN_PROGRESS') {
    res.status(200).json({
      data: {
        flagged: false,
        type: 'clean',
        reason: 'Session completed or inactive',
        confidence: 100,
        suspicionScore: 0,
        gazeDirection: 'center',
        details: '',
      },
    });
    return;
  }

  // Analyze frame using Gemini Flash — snapshot discarded immediately after call
  const analysis = await analyzeFrame(body.frame);

  if (analysis.flagged) {
    session.violationLogs.push({
      timestamp: new Date(),
      type: analysis.type,
      reason: analysis.reason,
      confidence: analysis.confidence,
    });

    // If electronic device present or high suspicion score, log strike
    if (analysis.type === 'electronic_device_present' || analysis.suspicionScore >= 80) {
      session.strikes = Math.min(3, session.strikes + 1);
      if (session.strikes >= 3) {
        session.status = 'AUTO_SUBMITTED_VIOLATION';
        session.submittedAt = new Date();
      }
    }

    await session.save();
  }

  res.status(200).json({
    data: {
      ...analysis,
      currentStrikes: session.strikes,
      sessionStatus: session.status,
    },
  });
}

/** Admin: Get full report of all candidate sessions for an assessment */
export async function getAssessmentReport(req: Request, res: Response): Promise<void> {
  const assessmentId = parseObjectId(req.params.id, 'id');

  const assessment = await Assessment.findById(assessmentId)
    .populate('problems', 'title difficulty')
    .lean();

  if (!assessment) {
    throw new HttpError(404, 'NOT_FOUND', 'Assessment not found.');
  }

  const sessions = await AssessmentSession.find({ assessmentId: assessment._id })
    .populate('userId', 'name email')
    .sort({ startedAt: -1 })
    .lean();

  const formattedSessions = sessions.map((s) => {
    const userDoc = s.userId as unknown as { name?: string; email?: string } | null;
    return {
      id: s._id.toString(),
      candidateName: userDoc?.name || 'Anonymous',
      candidateEmail: userDoc?.email || 'N/A',
      status: s.status,
      score: s.score,
      testCasesPassed: s.testCasesPassed,
      totalTestCases: s.totalTestCases,
      strikes: s.strikes,
      violationsCount: s.violationLogs?.length || 0,
      violationLogs: s.violationLogs || [],
      startedAt: s.startedAt,
      submittedAt: s.submittedAt,
    };
  });

  res.status(200).json({
    data: {
      assessment: {
        id: assessment._id.toString(),
        title: assessment.title,
        code: assessment.code,
        startTime: assessment.startTime,
        endTime: assessment.endTime,
        durationMinutes: assessment.durationMinutes,
        problems: assessment.problems,
      },
      sessions: formattedSessions,
    },
  });
}

/** Admin: Download CSV report of assessment candidates and proctor logs */
export async function exportAssessmentReport(req: Request, res: Response): Promise<void> {
  const assessmentId = parseObjectId(req.params.id, 'id');

  const assessment = await Assessment.findById(assessmentId).lean();
  if (!assessment) {
    throw new HttpError(404, 'NOT_FOUND', 'Assessment not found.');
  }

  const sessions = await AssessmentSession.find({ assessmentId: assessment._id })
    .populate('userId', 'name email')
    .sort({ startedAt: -1 })
    .lean();

  // Construct CSV content
  const headers = [
    'Candidate Name',
    'Candidate Email',
    'Status',
    'Score',
    'Test Cases Passed',
    'Total Test Cases',
    'Strikes (Out of 3)',
    'Total Violations Logged',
    'Violation Types Breakdown',
    'Started At',
    'Submitted At',
  ];

  const escapeCsv = (val: string | number | undefined | null) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows: string[] = [headers.join(',')];

  for (const s of sessions) {
    const userDoc = s.userId as unknown as { name?: string; email?: string } | null;
    const violationTypes = (s.violationLogs || [])
      .map((v) => `${v.type} (${v.reason})`)
      .join('; ');

    rows.push(
      [
        escapeCsv(userDoc?.name || 'Anonymous'),
        escapeCsv(userDoc?.email || 'N/A'),
        escapeCsv(s.status),
        escapeCsv(s.score),
        escapeCsv(s.testCasesPassed),
        escapeCsv(s.totalTestCases),
        escapeCsv(`${s.strikes}/3`),
        escapeCsv(s.violationLogs?.length || 0),
        escapeCsv(violationTypes || 'None (Clean)'),
        escapeCsv(s.startedAt ? new Date(s.startedAt).toISOString() : ''),
        escapeCsv(s.submittedAt ? new Date(s.submittedAt).toISOString() : ''),
      ].join(',')
    );
  }

  const csvString = rows.join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="assessment-${assessment.code}-report.csv"`
  );
  res.status(200).send(csvString);
}
