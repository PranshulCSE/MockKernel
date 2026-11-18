import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Assessment } from '../src/models/Assessment.js';
import { AssessmentSession } from '../src/models/AssessmentSession.js';
import { User } from '../src/models/User.js';
import { createTestApp, makeToken, mockMongooseQuery, setupTestEnv } from './helpers.js';

describe('AI-Proctored Assessment System Endpoints', () => {
  const adminId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  let adminToken: string;
  let studentToken: string;

  beforeEach(() => {
    setupTestEnv();
    adminToken = makeToken(adminId.toString(), 'admin');
    studentToken = makeToken(studentId.toString(), 'user');

    vi.spyOn(User, 'findById').mockImplementation(((id: unknown) => {
      const idStr = String(id);
      if (idStr === adminId.toString()) {
        return mockMongooseQuery({
          _id: adminId,
          name: 'Admin User',
          email: 'admin@example.com',
          role: 'admin',
        }) as never;
      }
      return mockMongooseQuery({
        _id: studentId,
        name: 'Jane Candidate',
        email: 'candidate@example.com',
        role: 'user',
      }) as never;
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('admin creates an assessment with custom access code and duration', async () => {
    const app = createTestApp();
    const assessmentId = new Types.ObjectId();

    vi.spyOn(Assessment, 'findOne').mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const createSpy = vi.spyOn(Assessment, 'create').mockImplementation(async (doc: unknown) => {
      const input = doc as Record<string, unknown>;
      return {
        _id: assessmentId,
        id: assessmentId.toString(),
        ...input,
      } as never;
    });

    const res = await request(app)
      .post('/api/admin/assessments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Algorithms Final Assessment',
        description: 'Proctored test on graphs and dynamic programming.',
        code: 'MOCK-7X9A',
        durationMinutes: 60,
        startTime: new Date().toISOString(),
        endTime: new Date(Date.now() + 86400000).toISOString(),
        problemIds: [],
        allowCustomProblems: false,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toBe('MOCK-7X9A');
    expect(res.body.data.durationMinutes).toBe(60);
    expect(createSpy).toHaveBeenCalled();
  });

  it('candidate joins assessment by code and retrieves instruction payload', async () => {
    const app = createTestApp();
    const assessmentId = new Types.ObjectId();

    const mockAssessment = {
      _id: assessmentId,
      title: 'Operating Systems Proctored Midterm',
      description: 'Strict proctoring enforced.',
      code: 'MOCK-OS1',
      startTime: new Date(Date.now() - 10000), // currently OPEN
      endTime: new Date(Date.now() + 3600000),
      durationMinutes: 45,
      problems: [
        {
          _id: new Types.ObjectId(),
          title: 'LRU Cache Design',
          statement: 'Implement an LRU Cache',
          difficulty: 'Medium',
          constraints: '1 <= capacity <= 3000',
        },
      ],
    };

    vi.spyOn(Assessment, 'findOne').mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockAssessment),
      }),
    } as never);

    vi.spyOn(AssessmentSession, 'findOne').mockReturnValue({
      lean: vi.fn().mockResolvedValue(null),
    } as never);

    const res = await request(app)
      .get('/api/assessments/join/MOCK-OS1')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Operating Systems Proctored Midterm');
    expect(res.body.data.windowState).toBe('OPEN');
    expect(res.body.data.problemCount).toBe(1);
  });

  it('candidate starts session and receives server deadline', async () => {
    const app = createTestApp();
    const assessmentId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();

    const mockAssessment = {
      _id: assessmentId,
      durationMinutes: 30,
      startTime: new Date(Date.now() - 5000),
      endTime: new Date(Date.now() + 7200000),
      problems: [],
    };

    vi.spyOn(Assessment, 'findById').mockReturnValue({
      populate: vi.fn().mockReturnValue({
        lean: vi.fn().mockResolvedValue(mockAssessment),
      }),
    } as never);

    vi.spyOn(AssessmentSession, 'findOne').mockResolvedValue(null);

    vi.spyOn(AssessmentSession, 'create').mockImplementation(async (doc: unknown) => {
      const input = doc as Record<string, unknown>;
      return {
        _id: sessionId,
        id: sessionId.toString(),
        ...input,
        save: vi.fn(),
      } as never;
    });

    const res = await request(app)
      .post(`/api/assessments/${assessmentId.toString()}/start`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.session.status).toBe('IN_PROGRESS');
    expect(res.body.data.durationMinutes).toBe(30);
    expect(typeof res.body.data.deadline).toBe('string');
  });

  it('records strikes and auto-submits on the 3rd strike with AUTO_SUBMITTED_VIOLATION', async () => {
    const app = createTestApp();
    const assessmentId = new Types.ObjectId();

    const mockSession = {
      _id: new Types.ObjectId(),
      assessmentId,
      userId: studentId,
      status: 'IN_PROGRESS',
      strikes: 2, // 2 strikes currently
      violationLogs: [] as any[],
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(AssessmentSession, 'findOne').mockResolvedValue(mockSession as never);

    const res = await request(app)
      .post(`/api/assessments/${assessmentId.toString()}/strike`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        type: 'TAB_SWITCH',
        reason: 'Candidate left fullscreen.',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.strikes).toBe(3);
    expect(res.body.data.status).toBe('AUTO_SUBMITTED_VIOLATION');
    expect(res.body.data.autoSubmitted).toBe(true);
    expect(mockSession.save).toHaveBeenCalled();
  });

  it('supports beacon fallback auto-submit on page reload / tab close', async () => {
    const app = createTestApp();
    const assessmentId = new Types.ObjectId();
    const sessionId = new Types.ObjectId();

    const mockSession = {
      _id: sessionId,
      assessmentId,
      userId: studentId,
      status: 'IN_PROGRESS',
      violationLogs: [] as any[],
      codeSubmissions: new Map(),
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(AssessmentSession, 'findById').mockResolvedValue(mockSession as never);

    const res = await request(app)
      .post(`/api/assessments/${assessmentId.toString()}/auto-submit`)
      .send({
        sessionId: sessionId.toString(),
        userId: studentId.toString(),
        reason: 'Candidate navigated away or closed browser tab.',
        status: 'AUTO_SUBMITTED_PAGE_RELOAD',
      });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(mockSession.status).toBe('AUTO_SUBMITTED_PAGE_RELOAD');
    expect(mockSession.save).toHaveBeenCalled();
  });

  it('candidate manually submits solutions and computes total score', async () => {
    const app = createTestApp();
    const assessmentId = new Types.ObjectId();
    const problemId = new Types.ObjectId().toString();

    const mockSession = {
      _id: new Types.ObjectId(),
      assessmentId,
      userId: studentId,
      status: 'IN_PROGRESS',
      codeSubmissions: new Map(),
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(AssessmentSession, 'findOne').mockResolvedValue(mockSession as never);

    const res = await request(app)
      .post(`/api/assessments/${assessmentId.toString()}/submit`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        codeSubmissions: {
          [problemId]: {
            code: 'def solution(): return True',
            language: 'python',
            testCasesPassed: 5,
            totalTestCases: 5,
          },
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUBMITTED');
    expect(res.body.data.testCasesPassed).toBe(5);
    expect(res.body.data.totalTestCases).toBe(5);
    expect(res.body.data.score).toBe(100);
  });

  it('admin downloads CSV report with candidate metrics and proctor logs', async () => {
    const app = createTestApp();
    const assessmentId = new Types.ObjectId();
    const candidateUserId = new Types.ObjectId();

    const mockAssessment = {
      _id: assessmentId,
      title: 'Web Engineering Midterm',
      code: 'MOCK-WEB1',
    };

    const mockSessions = [
      {
        _id: new Types.ObjectId(),
        userId: {
          _id: candidateUserId,
          name: 'Jane Doe',
          email: 'jane@example.com',
        },
        status: 'SUBMITTED',
        score: 90,
        testCasesPassed: 9,
        totalTestCases: 10,
        strikes: 0,
        violationLogs: [],
        startedAt: new Date(),
        submittedAt: new Date(),
      },
    ];

    vi.spyOn(Assessment, 'findById').mockReturnValue({
      lean: vi.fn().mockResolvedValue(mockAssessment),
    } as never);

    vi.spyOn(AssessmentSession, 'find').mockReturnValue({
      populate: vi.fn().mockReturnValue({
        sort: vi.fn().mockReturnValue({
          lean: vi.fn().mockResolvedValue(mockSessions),
        }),
      }),
    } as never);

    const res = await request(app)
      .get(`/api/admin/assessments/${assessmentId.toString()}/export`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toContain('Candidate Name,Candidate Email,Status,Score');
    expect(res.text).toContain('"Jane Doe","jane@example.com","SUBMITTED"');
  });
});
