import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Contest } from '../src/models/Contest.js';
import { InterviewSession } from '../src/models/InterviewSession.js';
import { Problem } from '../src/models/Problem.js';
import { Submission } from '../src/models/Submission.js';
import { User } from '../src/models/User.js';
import { withRetry } from '../src/services/groqRetry.js';
import * as groqService from '../src/services/groqService.js';
import { validateNextTurnPayload } from '../src/services/groqService.js';
import { HttpError } from '../src/utils/http.js';
import {
  createTestApp,
  makeToken,
  mockMongooseQuery,
  setupTestEnv,
} from './helpers.js';

describe('AI Interviews and Admin Management Endpoints', () => {
  const userId = new Types.ObjectId();
  const otherUserId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const superId = new Types.ObjectId();

  let userToken: string;
  let adminToken: string;
  let superToken: string;

  beforeEach(() => {
    setupTestEnv();
    userToken = makeToken(userId.toString(), 'user');
    adminToken = makeToken(adminId.toString(), 'admin');
    superToken = makeToken(superId.toString(), 'superadmin');

    vi.spyOn(User, 'findById').mockImplementation(((id: string) => {
      if (id === adminId.toString()) {
        return mockMongooseQuery({
          _id: adminId,
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin',
        }) as never;
      }
      if (id === superId.toString()) {
        return mockMongooseQuery({
          _id: superId,
          name: 'SuperAdmin',
          email: 'super@example.com',
          role: 'superadmin',
        }) as never;
      }
      return mockMongooseQuery({
        _id: userId,
        name: 'Student',
        email: 'student@example.com',
        role: 'user',
      }) as never;
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('validates interview start inputs and propagates AI failures explicitly', async () => {
    const app = createTestApp();

    const badCount = await request(app)
      .post('/api/interviews')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        topics: ['Operating Systems'],
        difficulty: 'Medium',
        questionCount: 50,
      });
    expect(badCount.status).toBe(400);

    vi.spyOn(groqService, 'generateNextQuestion').mockRejectedValue(
      new HttpError(503, 'AI_UNAVAILABLE', 'AI interviewer is temporarily unavailable.')
    );

    const aiDownRes = await request(app)
      .post('/api/interviews')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        topics: ['Operating Systems'],
        difficulty: 'Medium',
        questionCount: 3,
      });

    expect(aiDownRes.status).toBe(503);
    expect(aiDownRes.body.error.code).toBe('AI_UNAVAILABLE');
  });

  it('runs interview start, answer, complete, abandon, and enforces ownership & transitions', async () => {
    const app = createTestApp();
    const sessionId = new Types.ObjectId();

    vi.spyOn(groqService, 'generateNextQuestion').mockResolvedValue({
      nextQuestion: {
        question: 'Explain virtual memory paging.',
        topic: 'Operating Systems',
        difficulty: 'Medium',
      },
      isComplete: false,
    });

    vi.spyOn(InterviewSession, 'create').mockResolvedValue({
      id: sessionId.toString(),
      _id: sessionId,
      user: userId,
      topics: ['Operating Systems'],
      difficulty: 'Medium',
      questionCount: 2,
      status: 'in_progress',
      startedAt: new Date(),
    } as never);

    const startRes = await request(app)
      .post('/api/interviews')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        topics: ['Operating Systems'],
        difficulty: 'Medium',
        questionCount: 2,
      });
    expect(startRes.status).toBe(201);
    expect(startRes.body.data.questionNumber).toBe(1);

    // Ownership check on foreign session
    vi.spyOn(InterviewSession, 'findById').mockReturnValue(
      mockMongooseQuery({
        id: sessionId.toString(),
        _id: sessionId,
        user: otherUserId,
        status: 'in_progress',
        questions: [{ question: 'Q1', askedAt: new Date() }],
      }) as never
    );

    const foreignRes = await request(app)
      .post(`/api/interviews/${sessionId.toString()}/answer`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ answer: 'My answer' });
    expect(foreignRes.status).toBe(403);

    // Answering question 1 advances to question 2
    const activeSession = {
      id: sessionId.toString(),
      _id: sessionId,
      user: userId,
      topics: ['Operating Systems'],
      difficulty: 'Medium',
      questionCount: 2,
      status: 'in_progress' as 'in_progress' | 'completed' | 'abandoned',
      questions: [{ question: 'Explain paging.', askedAt: new Date() }] as Array<{
        question: string;
        answer?: string;
        score?: number;
        feedback?: string;
        askedAt: Date;
        answeredAt?: Date;
      }>,
      overallScore: undefined as number | undefined,
      feedback: undefined as string | undefined,
      completedAt: undefined as Date | undefined,
      save: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(InterviewSession, 'findById').mockReturnValue(
      mockMongooseQuery(activeSession) as never
    );
    vi.spyOn(groqService, 'generateNextQuestion').mockResolvedValue({
      evaluation: { score: 8, feedback: 'Clear explanation.' },
      nextQuestion: {
        question: 'What is thrashing?',
        topic: 'Operating Systems',
        difficulty: 'Hard',
      },
      isComplete: false,
    });

    const ansRes = await request(app)
      .post(`/api/interviews/${sessionId.toString()}/answer`)
      .set('Authorization', `Bearer ${userToken}`)
      .send({ answer: 'Paging maps virtual pages to physical frames.' });

    expect(ansRes.status).toBe(200);
    expect(ansRes.body.data.isComplete).toBe(false);
    expect(ansRes.body.data.questionNumber).toBe(2);

    // Completing active session explicitly
    vi.spyOn(groqService, 'generateFinalFeedback').mockResolvedValue({
      overallScore: 8,
      feedback: 'Strong understanding of OS memory concepts.',
    });

    const completeRes = await request(app)
      .post(`/api/interviews/${sessionId.toString()}/complete`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(completeRes.status).toBe(200);
    expect(completeRes.body.data.status).toBe('completed');
    expect(completeRes.body.data.overallScore).toBe(8);

    // Cannot abandon an already completed session
    const abandonAfterComplete = await request(app)
      .patch(`/api/interviews/${sessionId.toString()}/abandon`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(abandonAfterComplete.status).toBe(409);
    expect(abandonAfterComplete.body.error.code).toBe('SESSION_NOT_ACTIVE');
  });

  it('validates Groq turn payloads and retries 429/5xx with backoff', async () => {
    // Rejects premature completion when expectComplete is false and nextQuestion missing
    expect(() =>
      validateNextTurnPayload(
        { evaluation: { score: 7, feedback: 'Good' }, isComplete: true },
        { isInitial: false, expectComplete: false, allowedTopics: ['DBMS'] }
      )
    ).toThrow(/Missing nextQuestion/);

    const fn = vi
      .fn()
      .mockRejectedValueOnce({ status: 429 })
      .mockRejectedValueOnce({ status: 503 })
      .mockResolvedValueOnce('ok');

    const sleepMock = vi.fn().mockResolvedValue(undefined);
    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      sleep: sleepMock,
    });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
  });

  it('enforces admin/superadmin restrictions and pagination on admin endpoints', async () => {
    const app = createTestApp();

    vi.spyOn(Problem, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(10),
    } as never);
    vi.spyOn(Contest, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(2),
    } as never);
    vi.spyOn(Submission, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(42),
    } as never);
    vi.spyOn(User, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(15),
    } as never);

    const statsRes = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(statsRes.status).toBe(200);
    expect(statsRes.body.data.totalProblems).toBe(10);

    // Admin cannot list users; superadmin can with pagination & filtering
    const forbiddenUsers = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(forbiddenUsers.status).toBe(403);

    const userFindSpy = vi.spyOn(User, 'find').mockReturnValue(
      mockMongooseQuery([
        {
          _id: adminId,
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]) as never
    );

    const listUsersRes = await request(app)
      .get('/api/admin/users?page=1&limit=5&role=admin&search=adm')
      .set('Authorization', `Bearer ${superToken}`);

    expect(listUsersRes.status).toBe(200);
    expect(userFindSpy).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'admin' })
    );
    expect(listUsersRes.body.data[0].passwordHash).toBeUndefined();
    expect(listUsersRes.body.pagination).toEqual({
      page: 1,
      limit: 5,
      total: 15,
      totalPages: 3,
    });
  });
});
