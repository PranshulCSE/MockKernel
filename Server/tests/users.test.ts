import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContestParticipant } from '../src/models/ContestParticipant.js';
import { InterviewSession } from '../src/models/InterviewSession.js';
import { Submission } from '../src/models/Submission.js';
import { User } from '../src/models/User.js';
import {
  createTestApp,
  makeToken,
  mockMongooseQuery,
  setupTestEnv,
} from './helpers.js';

describe('Student stats endpoint', () => {
  const userId = new Types.ObjectId();
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

  it('requires authentication', async () => {
    const app = createTestApp();
    const res = await request(app).get('/api/users/me/stats');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('returns user-scoped submission, contest, and interview stats', async () => {
    const app = createTestApp();
    const submissionAggregate = vi.spyOn(Submission, 'aggregate').mockReturnValue({
      exec: vi.fn().mockResolvedValue([
        {
          solvedProblems: [{ count: 4 }],
          attemptedProblems: [{ count: 7 }],
          totalSubmissions: [{ count: 12 }],
        },
      ]),
    } as never);
    const contestCount = vi
      .spyOn(ContestParticipant, 'countDocuments')
      .mockReturnValue({
        exec: vi.fn().mockResolvedValue(3),
      } as never);
    vi.spyOn(InterviewSession, 'aggregate').mockReturnValue({
      exec: vi.fn().mockResolvedValue([
        {
          _id: null,
          total: 5,
          completed: 3,
          inProgress: 1,
          abandoned: 1,
          averageScore: 7.666666,
        },
      ]),
    } as never);

    const res = await request(app)
      .get('/api/users/me/stats')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      solvedProblems: 4,
      attemptedProblems: 7,
      totalSubmissions: 12,
      contestsJoined: 3,
      interviewsStarted: 5,
      interviewsCompleted: 3,
      interviewsInProgress: 1,
      interviewsAbandoned: 1,
      averageInterviewScore: 7.7,
    });

    expect(submissionAggregate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          $match: expect.objectContaining({ user: userId, mode: 'submit' }),
        }),
      ])
    );
    expect(contestCount).toHaveBeenCalledWith({ user: userId });
  });

  it('returns zeroed stats when the student has no activity', async () => {
    const app = createTestApp();
    vi.spyOn(Submission, 'aggregate').mockReturnValue({
      exec: vi.fn().mockResolvedValue([
        {
          solvedProblems: [],
          attemptedProblems: [],
          totalSubmissions: [],
        },
      ]),
    } as never);
    vi.spyOn(ContestParticipant, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(0),
    } as never);
    vi.spyOn(InterviewSession, 'aggregate').mockReturnValue({
      exec: vi.fn().mockResolvedValue([]),
    } as never);

    const res = await request(app)
      .get('/api/users/me/stats')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      solvedProblems: 0,
      attemptedProblems: 0,
      totalSubmissions: 0,
      contestsJoined: 0,
      interviewsStarted: 0,
      interviewsCompleted: 0,
      interviewsInProgress: 0,
      interviewsAbandoned: 0,
      averageInterviewScore: null,
    });
  });
});
