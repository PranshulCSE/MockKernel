import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Contest } from '../src/models/Contest.js';
import { ContestParticipant } from '../src/models/ContestParticipant.js';
import { Problem } from '../src/models/Problem.js';
import { Submission } from '../src/models/Submission.js';
import { TestCase } from '../src/models/TestCase.js';
import { User } from '../src/models/User.js';
import * as submissionQueue from '../src/queues/submissionQueue.js';
import { HttpError } from '../src/utils/http.js';
import {
  createTestApp,
  makeToken,
  mockMongooseQuery,
  setupTestEnv,
} from './helpers.js';

describe('Submissions API and BullMQ Queue Integration', () => {
  const userId = new Types.ObjectId();
  const otherUserId = new Types.ObjectId();
  const problemId = new Types.ObjectId();
  let userToken: string;

  beforeEach(() => {
    setupTestEnv();
    userToken = makeToken(userId.toString(), 'user');
    vi.spyOn(User, 'findById').mockReturnValue(
      mockMongooseQuery({
        _id: userId,
        name: 'Student',
        email: 'student@example.com',
        role: 'user',
      }) as never
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unsupported language for selected problem', async () => {
    const app = createTestApp();
    vi.spyOn(Problem, 'findOne').mockReturnValue(
      mockMongooseQuery({
        _id: problemId,
        supportedLanguages: ['python'],
      }) as never
    );

    const res = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        problemId: problemId.toString(),
        language: 'cpp',
        mode: 'submit',
        sourceCode: 'int main() { return 0; }',
      });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('UNSUPPORTED_LANGUAGE');
  });

  it('creates run and submit submissions and enqueues jobs onto BullMQ', async () => {
    const app = createTestApp();
    const tcId = new Types.ObjectId();
    const subId = new Types.ObjectId();

    vi.spyOn(Problem, 'findOne').mockReturnValue(
      mockMongooseQuery({
        _id: problemId,
        supportedLanguages: ['python', 'javascript'],
      }) as never
    );
    vi.spyOn(Submission, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(0),
    } as never);
    const tcFindSpy = vi.spyOn(TestCase, 'find').mockReturnValue(
      mockMongooseQuery([
        { _id: tcId, input: '1 2', expectedOutput: '3' },
      ]) as never
    );
    vi.spyOn(Submission, 'create').mockResolvedValue({
      id: subId.toString(),
      _id: subId,
      user: userId,
      problem: problemId,
      language: 'python',
      mode: 'run',
      verdict: 'PENDING',
      createdAt: new Date(),
      save: vi.fn().mockResolvedValue(undefined),
    } as never);
    const enqueueSpy = vi
      .spyOn(submissionQueue, 'enqueueSubmission')
      .mockResolvedValue(subId.toString());

    const runRes = await request(app)
      .post('/api/submissions/run')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        problemId: problemId.toString(),
        language: 'python',
        sourceCode: 'print(3)',
      });

    expect(runRes.status).toBe(202);
    expect(runRes.body.data.submissionId).toBe(subId.toString());
    expect(runRes.body.data.mode).toBe('run');
    expect(runRes.body.data.verdict).toBe('PENDING');
    expect(tcFindSpy).toHaveBeenCalledWith({ problem: problemId, isSample: true });
    expect(enqueueSpy).toHaveBeenCalledWith({
      submissionId: subId.toString(),
      testCases: [
        {
          testCaseId: tcId.toString(),
          input: '1 2',
          expectedOutput: '3',
        },
      ],
    });
  });

  it('handles queue failure gracefully by marking INTERNAL_ERROR and returning 503', async () => {
    const app = createTestApp();
    const subId = new Types.ObjectId();
    const saveMock = vi.fn().mockResolvedValue(undefined);

    vi.spyOn(Problem, 'findOne').mockReturnValue(
      mockMongooseQuery({
        _id: problemId,
        supportedLanguages: ['python'],
      }) as never
    );
    vi.spyOn(Submission, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(0),
    } as never);
    vi.spyOn(TestCase, 'find').mockReturnValue(
      mockMongooseQuery([
        { _id: new Types.ObjectId(), input: '', expectedOutput: '' },
      ]) as never
    );
    const doc = {
      id: subId.toString(),
      _id: subId,
      user: userId,
      problem: problemId,
      language: 'python',
      mode: 'submit',
      verdict: 'PENDING',
      compileOutput: undefined as string | undefined,
      createdAt: new Date(),
      save: saveMock,
    };
    vi.spyOn(Submission, 'create').mockResolvedValue(doc as never);
    vi.spyOn(submissionQueue, 'enqueueSubmission').mockRejectedValue(
      new HttpError(503, 'QUEUE_UNAVAILABLE', 'Submission execution queue is temporarily unavailable.')
    );

    const res = await request(app)
      .post('/api/submissions/submit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        problemId: problemId.toString(),
        language: 'python',
        sourceCode: 'print("")',
      });

    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('QUEUE_UNAVAILABLE');
    expect(doc.verdict).toBe('INTERNAL_ERROR');
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it('prevents unauthorized access to another user submission and returns status route', async () => {
    const app = createTestApp();
    const subId = new Types.ObjectId();

    vi.spyOn(Submission, 'findById').mockReturnValue(
      mockMongooseQuery({
        id: subId.toString(),
        _id: subId,
        user: otherUserId,
        problem: problemId,
        language: 'python',
        mode: 'submit',
        verdict: 'ACCEPTED',
        runtime: 24,
        memory: 1024,
        testCaseResults: [
          {
            testCase: new Types.ObjectId(),
            passed: true,
            verdict: 'ACCEPTED',
            stdout: 'secret output',
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as never
    );

    const forbidden = await request(app)
      .get(`/api/submissions/${subId.toString()}`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error.code).toBe('FORBIDDEN');

    vi.spyOn(Submission, 'findById').mockReturnValue(
      mockMongooseQuery({
        id: subId.toString(),
        _id: subId,
        user: userId,
        problem: problemId,
        language: 'python',
        mode: 'submit',
        verdict: 'ACCEPTED',
        runtime: 24,
        memory: 1024,
        testCaseResults: [
          {
            testCase: new Types.ObjectId(),
            passed: true,
            verdict: 'ACCEPTED',
            stdout: 'hidden output should not leak in submit mode',
          },
        ],
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as never
    );

    const statusRes = await request(app)
      .get(`/api/submissions/${subId.toString()}/status`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.verdict).toBe('ACCEPTED');
    expect(statusRes.body.data.testCaseResults[0].stdout).toBeUndefined();
  });

  it('rejects contest submissions when user has not joined the contest', async () => {
    const app = createTestApp();
    const contestId = new Types.ObjectId();

    vi.spyOn(Problem, 'findOne').mockReturnValue(
      mockMongooseQuery({
        _id: problemId,
        supportedLanguages: ['python'],
      }) as never
    );
    vi.spyOn(Contest, 'findById').mockReturnValue(
      mockMongooseQuery({
        _id: contestId,
        status: 'live',
        startTime: new Date(Date.now() - 60_000),
        endTime: new Date(Date.now() + 60_000),
        problems: [{ problem: problemId, points: 100, order: 0 }],
      }) as never
    );
    vi.spyOn(ContestParticipant, 'findOne').mockReturnValue(
      mockMongooseQuery(null) as never
    );

    const res = await request(app)
      .post('/api/submissions')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        problemId: problemId.toString(),
        contestId: contestId.toString(),
        language: 'python',
        mode: 'submit',
        sourceCode: 'print(1)',
      });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('NOT_CONTEST_PARTICIPANT');
  });
});
