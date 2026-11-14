import type { Request, Response } from 'express';
import { Types, type QueryFilter } from 'mongoose';
import { getAuthUser } from '../middleware/auth.js';
import {
  INTERVIEW_STATUSES,
  INTERVIEW_TOPICS,
  InterviewSession,
  type IInterviewSession,
  type InterviewStatus,
  type InterviewTopic,
} from '../models/InterviewSession.js';
import { DIFFICULTIES, type Difficulty } from '../models/Problem.js';
import {
  generateFinalFeedback,
  generateNextQuestion,
} from '../services/groqService.js';
import { HttpError } from '../utils/http.js';
import {
  getPagination,
  isRecord,
  parseObjectId,
  parsePaginationQuery,
  readInteger,
  readQueryString,
  readString,
} from '../utils/request.js';

const MAX_ANSWER_LENGTH = 5000;

function parseTopics(value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'topics must be a non-empty array.'
    );
  }

  const unique: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || item.trim().length < 2 || item.trim().length > 100) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'Each topic must be a non-empty string between 2 and 100 characters.'
      );
    }
    const topic = item.trim();
    if (!unique.includes(topic)) {
      unique.push(topic);
    }
  }

  return unique;
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

function parseStatus(value: string): InterviewStatus {
  if (!(INTERVIEW_STATUSES as readonly string[]).includes(value)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `status must be one of: ${INTERVIEW_STATUSES.join(', ')}.`
    );
  }
  return value as InterviewStatus;
}

/** POST /api/interviews */
export async function startInterviewSession(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const body = req.body as unknown;
  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const topics = parseTopics(body.topics);
  const difficulty = parseDifficulty(body.difficulty);
  const questionCount = readInteger(body.questionCount, 'questionCount', 1, 20);

  const firstTurn = await generateNextQuestion({
    topics: topics as any,
    difficulty,
    questionCount,
    history: [],
  });

  if (!firstTurn.nextQuestion) {
    throw new HttpError(
      502,
      'AI_INVALID_RESPONSE',
      'AI did not return an opening question.'
    );
  }

  const now = new Date();
  const session = await InterviewSession.create({
    user: new Types.ObjectId(authUser.id),
    topics: topics as any,
    difficulty,
    questionCount,
    status: 'in_progress',
    startedAt: now,
    questions: [
      {
        question: firstTurn.nextQuestion.question,
        askedAt: now,
      },
    ],
  });

  res.status(201).json({
    data: {
      id: session.id,
      sessionId: session.id,
      status: session.status,
      difficulty: session.difficulty,
      topics: session.topics,
      questionCount: session.questionCount,
      questionNumber: 1,
      question: firstTurn.nextQuestion,
      startedAt: session.startedAt,
    },
  });
}

/** POST /api/interviews/:id/answer */
export async function submitInterviewAnswer(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const sessionId = parseObjectId(req.params.id, 'Interview session id');
  const body = req.body as unknown;

  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const answer = readString(body.answer, 'answer', {
    min: 1,
    max: MAX_ANSWER_LENGTH,
  });

  const session = await InterviewSession.findById(sessionId).exec();
  if (!session) {
    throw new HttpError(
      404,
      'INTERVIEW_NOT_FOUND',
      'Interview session not found.'
    );
  }

  if (session.user.toString() !== authUser.id) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'You do not have access to this interview session.'
    );
  }

  if (session.status !== 'in_progress') {
    throw new HttpError(
      409,
      'SESSION_NOT_ACTIVE',
      `Interview session is already ${session.status}.`
    );
  }

  const currentQuestion = session.questions.find((q) => !q.answeredAt);
  if (!currentQuestion) {
    throw new HttpError(
      400,
      'NO_PENDING_QUESTION',
      'There is no unanswered question in this session.'
    );
  }

  const historyForGroq = session.questions.map((q) => ({
    question: q.question,
    ...(q.answer !== undefined ? { answer: q.answer } : {}),
    ...(q.score !== undefined ? { score: q.score } : {}),
    ...(q.feedback !== undefined ? { feedback: q.feedback } : {}),
  }));

  const turnResult = await generateNextQuestion({
    topics: session.topics,
    difficulty: session.difficulty,
    questionCount: session.questionCount,
    history: historyForGroq,
    currentAnswer: answer,
  });

  if (!turnResult.evaluation) {
    throw new HttpError(
      502,
      'AI_INVALID_RESPONSE',
      'AI did not return an evaluation.'
    );
  }

  currentQuestion.answer = answer;
  currentQuestion.answeredAt = new Date();
  currentQuestion.score = turnResult.evaluation.score;
  currentQuestion.feedback = turnResult.evaluation.feedback;

  const isSessionFinished = session.questions.length >= session.questionCount;
  if (isSessionFinished) {
    const completedHistory = session.questions.map((q) => ({
      question: q.question,
      ...(q.answer !== undefined ? { answer: q.answer } : {}),
      ...(q.score !== undefined ? { score: q.score } : {}),
      ...(q.feedback !== undefined ? { feedback: q.feedback } : {}),
    }));

    const summary = await generateFinalFeedback({
      topics: session.topics,
      difficulty: session.difficulty,
      history: completedHistory,
    });

    session.status = 'completed';
    session.overallScore = summary.overallScore;
    session.feedback = summary.feedback;
    session.completedAt = new Date();
    await session.save();

    res.status(200).json({
      data: {
        sessionId: session.id,
        status: session.status,
        evaluation: turnResult.evaluation,
        isComplete: true,
        summary,
        completedAt: session.completedAt,
      },
    });
    return;
  }

  if (!turnResult.nextQuestion) {
    throw new HttpError(
      502,
      'AI_INVALID_RESPONSE',
      'AI did not return the next question.'
    );
  }

  session.questions.push({
    question: turnResult.nextQuestion.question,
    askedAt: new Date(),
  });
  await session.save();

  res.status(200).json({
    data: {
      sessionId: session.id,
      status: session.status,
      evaluation: turnResult.evaluation,
      isComplete: false,
      questionNumber: session.questions.length,
      questionCount: session.questionCount,
      nextQuestion: turnResult.nextQuestion,
    },
  });
}

/** POST /api/interviews/:id/complete */
export async function completeInterviewSession(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const sessionId = parseObjectId(req.params.id, 'Interview session id');

  const session = await InterviewSession.findById(sessionId).exec();
  if (!session) {
    throw new HttpError(
      404,
      'INTERVIEW_NOT_FOUND',
      'Interview session not found.'
    );
  }

  if (session.user.toString() !== authUser.id) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'You do not have permission to complete this session.'
    );
  }

  if (session.status !== 'in_progress') {
    throw new HttpError(
      409,
      'SESSION_NOT_ACTIVE',
      `Interview session is already ${session.status}.`
    );
  }

  const answeredQuestions = session.questions.filter((q) => Boolean(q.answeredAt));
  if (answeredQuestions.length === 0) {
    throw new HttpError(
      409,
      'NO_ANSWERED_QUESTIONS',
      'Cannot complete an interview before answering at least one question.'
    );
  }

  const summary = await generateFinalFeedback({
    topics: session.topics,
    difficulty: session.difficulty,
    history: answeredQuestions.map((q) => ({
      question: q.question,
      ...(q.answer !== undefined ? { answer: q.answer } : {}),
      ...(q.score !== undefined ? { score: q.score } : {}),
      ...(q.feedback !== undefined ? { feedback: q.feedback } : {}),
    })),
  });

  session.status = 'completed';
  session.overallScore = summary.overallScore;
  session.feedback = summary.feedback;
  session.completedAt = new Date();
  await session.save();

  res.status(200).json({
    data: {
      id: session.id,
      sessionId: session.id,
      status: session.status,
      overallScore: session.overallScore,
      feedback: session.feedback,
      completedAt: session.completedAt,
    },
  });
}

/** GET /api/interviews/:id */
export async function getInterviewSession(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const sessionId = parseObjectId(req.params.id, 'Interview session id');

  const session = await InterviewSession.findById(sessionId).exec();
  if (!session) {
    throw new HttpError(
      404,
      'INTERVIEW_NOT_FOUND',
      'Interview session not found.'
    );
  }

  const isAdmin = authUser.role === 'admin' || authUser.role === 'superadmin';
  if (session.user.toString() !== authUser.id && !isAdmin) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'You do not have permission to view this interview session.'
    );
  }

  res.status(200).json({
    data: {
      id: session.id,
      user: session.user.toString(),
      difficulty: session.difficulty,
      questionCount: session.questionCount,
      topics: session.topics,
      status: session.status,
      questions: session.questions,
      overallScore: session.overallScore,
      feedback: session.feedback,
      startedAt: session.startedAt,
      completedAt: session.completedAt,
    },
  });
}

/** GET /api/interviews */
export async function listInterviewSessions(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);

  const filter: QueryFilter<IInterviewSession> = {
    user: new Types.ObjectId(authUser.id),
  };

  const status = readQueryString(req.query.status, 'status');
  if (status) {
    filter.status = parseStatus(status);
  }

  const difficulty = readQueryString(req.query.difficulty, 'difficulty');
  if (difficulty) {
    filter.difficulty = parseDifficulty(difficulty);
  }

  const [sessions, total] = await Promise.all([
    InterviewSession.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select(
        'topics difficulty questionCount status overallScore startedAt completedAt'
      )
      .exec(),
    InterviewSession.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: sessions.map((s) => ({
      id: s.id,
      topics: s.topics,
      difficulty: s.difficulty,
      questionCount: s.questionCount,
      status: s.status,
      overallScore: s.overallScore,
      startedAt: s.startedAt,
      completedAt: s.completedAt,
    })),
    pagination: getPagination(page, limit, total),
  });
}

/** PATCH /api/interviews/:id/abandon */
export async function abandonInterviewSession(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const sessionId = parseObjectId(req.params.id, 'Interview session id');

  const session = await InterviewSession.findById(sessionId).exec();
  if (!session) {
    throw new HttpError(
      404,
      'INTERVIEW_NOT_FOUND',
      'Interview session not found.'
    );
  }

  if (session.user.toString() !== authUser.id) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'You do not have permission to abandon this session.'
    );
  }

  if (session.status !== 'in_progress') {
    throw new HttpError(
      409,
      'SESSION_NOT_ACTIVE',
      `Interview session is already ${session.status}.`
    );
  }

  session.status = 'abandoned';
  session.completedAt = new Date();
  await session.save();

  res.status(200).json({
    data: {
      id: session.id,
      status: session.status,
      completedAt: session.completedAt,
    },
  });
}
