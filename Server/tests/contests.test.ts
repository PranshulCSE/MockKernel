import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Contest } from '../src/models/Contest.js';
import { ContestParticipant } from '../src/models/ContestParticipant.js';
import { Problem } from '../src/models/Problem.js';
import { Submission } from '../src/models/Submission.js';
import { User } from '../src/models/User.js';
import { recordAcceptedSubmission } from '../src/services/leaderboardService.js';
import { normalizeCode } from '../src/services/plagiarism/normalizer.js';
import { computeSimilarity } from '../src/services/plagiarism/similarity.js';
import {
  createTestApp,
  makeToken,
  mockMongooseQuery,
  setupTestEnv,
} from './helpers.js';

describe('Contests Lifecycle, Participation, Leaderboard, and Plagiarism', () => {
  const adminId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  let adminToken: string;
  let userToken: string;

  beforeEach(() => {
    setupTestEnv();
    adminToken = makeToken(adminId.toString(), 'admin');
    userToken = makeToken(userId.toString(), 'user');

    vi.spyOn(User, 'findById').mockImplementation(((id: string) => {
      if (id === adminId.toString()) {
        return mockMongooseQuery({
          _id: adminId,
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin',
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

  it('validates contest start/end times and blocks non-admin creation', async () => {
    const app = createTestApp();
    const probId = new Types.ObjectId().toString();

    const forbidden = await request(app)
      .post('/api/admin/contests')
      .set('Authorization', `Bearer ${userToken}`)
      .send({});
    expect(forbidden.status).toBe(403);

    const invalidTime = await request(app)
      .post('/api/admin/contests')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Weekly Contest 1',
        description: 'Fun contest',
        startTime: '2026-12-01T12:00:00Z',
        endTime: '2026-12-01T10:00:00Z',
        problems: [{ problemId: probId, points: 100, order: 0 }],
      });

    expect(invalidTime.status).toBe(400);
    expect(invalidTime.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('prevents editing live contests and enforces valid lifecycle transitions', async () => {
    const app = createTestApp();
    const contestId = new Types.ObjectId();
    const probId = new Types.ObjectId();

    const liveContestDoc = {
      id: contestId.toString(),
      _id: contestId,
      title: 'Live Contest',
      description: 'Desc',
      problems: [{ problem: probId, points: 100, order: 0 }],
      startTime: new Date(Date.now() - 10_000),
      endTime: new Date(Date.now() + 60_000),
      status: 'live' as const,
      createdBy: adminId,
      save: vi.fn().mockResolvedValue(undefined),
    };

    vi.spyOn(Contest, 'findById').mockReturnValue(
      mockMongooseQuery(liveContestDoc) as never
    );

    const editLiveRes = await request(app)
      .patch(`/api/admin/contests/${contestId.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Updated Title' });

    expect(editLiveRes.status).toBe(409);
    expect(editLiveRes.body.error.code).toBe('CONTEST_NOT_EDITABLE');

    // End the live contest
    vi.spyOn(ContestParticipant, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(5),
    } as never);

    const endRes = await request(app)
      .post(`/api/admin/contests/${contestId.toString()}/end`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(endRes.status).toBe(200);
    expect(endRes.body.data.status).toBe('ended');

    // Cannot transition ended -> live
    const reopenRes = await request(app)
      .post(`/api/admin/contests/${contestId.toString()}/start`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(reopenRes.status).toBe(409);
    expect(reopenRes.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  it('prevents joining ended contests and duplicate participation', async () => {
    const app = createTestApp();
    const contestId = new Types.ObjectId();

    vi.spyOn(Contest, 'findById').mockReturnValue(
      mockMongooseQuery({
        id: contestId.toString(),
        _id: contestId,
        status: 'ended',
        endTime: new Date(Date.now() - 1000),
      }) as never
    );

    const endedJoin = await request(app)
      .post(`/api/contests/${contestId.toString()}/join`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(endedJoin.status).toBe(409);
    expect(endedJoin.body.error.code).toBe('CONTEST_ENDED');

    // Live contest, duplicate join throws E11000 -> 409 ALREADY_JOINED
    vi.spyOn(Contest, 'findById').mockReturnValue(
      mockMongooseQuery({
        id: contestId.toString(),
        _id: contestId,
        status: 'live',
        endTime: new Date(Date.now() + 60_000),
      }) as never
    );
    vi.spyOn(ContestParticipant, 'create').mockRejectedValue({ code: 11000 });

    const dupJoin = await request(app)
      .post(`/api/contests/${contestId.toString()}/join`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(dupJoin.status).toBe(409);
    expect(dupJoin.body.error.code).toBe('ALREADY_JOINED');
  });

  it('lists contest participants and authenticated user contest submissions', async () => {
    const app = createTestApp();
    const contestId = new Types.ObjectId();

    vi.spyOn(Contest, 'findOne').mockReturnValue(
      mockMongooseQuery({ _id: contestId }) as never
    );
    vi.spyOn(ContestParticipant, 'find').mockReturnValue(
      mockMongooseQuery([
        {
          user: { _id: userId, name: 'Student' },
          joinedAt: new Date(),
        },
      ]) as never
    );
    vi.spyOn(ContestParticipant, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(1),
    } as never);

    const participantsRes = await request(app).get(
      `/api/contests/${contestId.toString()}/participants`
    );
    expect(participantsRes.status).toBe(200);
    expect(participantsRes.body.data).toHaveLength(1);
    expect(participantsRes.body.data[0].name).toBe('Student');

    vi.spyOn(Submission, 'find').mockReturnValue(mockMongooseQuery([]) as never);
    vi.spyOn(Submission, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(0),
    } as never);

    const subsRes = await request(app)
      .get(`/api/contests/${contestId.toString()}/submissions`)
      .set('Authorization', `Bearer ${userToken}`);
    expect(subsRes.status).toBe(200);
    expect(subsRes.body.data).toEqual([]);
  });

  it('deduplicates repeat Accepted submissions when updating contest leaderboard', async () => {
    const contestId = new Types.ObjectId().toString();
    const problemId = new Types.ObjectId().toString();
    const subId = new Types.ObjectId().toString();

    vi.spyOn(Contest, 'findById').mockReturnValue(
      mockMongooseQuery({
        status: 'live',
        problems: [{ problem: new Types.ObjectId(problemId), points: 100, order: 0 }],
      }) as never
    );
    vi.spyOn(ContestParticipant, 'findOne').mockReturnValue(
      mockMongooseQuery({ isDisqualified: false }) as never
    );
    vi.spyOn(Submission, 'exists').mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    } as never);

    const saddMock = vi.fn().mockResolvedValueOnce(1).mockResolvedValueOnce(0);
    const zincrbyMock = vi.fn().mockResolvedValue('100');
    const mockRedis = {
      status: 'ready',
      sadd: saddMock,
      zincrby: zincrbyMock,
    };

    const first = await recordAcceptedSubmission(
      { contestId, problemId, userId: userId.toString(), submissionId: subId },
      { redisClient: mockRedis as never }
    );
    expect(first).toEqual({ updated: true, pointsAdded: 100, totalScore: 100 });

    const duplicate = await recordAcceptedSubmission(
      { contestId, problemId, userId: userId.toString(), submissionId: subId },
      { redisClient: mockRedis as never }
    );
    expect(duplicate).toEqual({ updated: false, reason: 'ALREADY_SOLVED' });
    expect(zincrbyMock).toHaveBeenCalledTimes(1);
  });

  it('normalizes renamed variables and detects high code similarity', () => {
    const codeA = `
      def solve(nums, target):
          seen = {}
          for i in range(len(nums)):
              diff = target - nums[i]
              if diff in seen:
                  return [seen[diff], i]
              seen[nums[i]] = i
          return []
    `;
    const codeB = `
      def compute(arr, goal):
          # renamed variables and comments
          lookup = {}
          for idx in range(len(arr)):
              rem = goal - arr[idx]
              if rem in lookup:
                  return [lookup[rem], idx]
              lookup[arr[idx]] = idx
          return []
    `;
    const normA = normalizeCode(codeA, 'python');
    const normB = normalizeCode(codeB, 'python');
    expect(computeSimilarity(normA, normB)).toBe(1);
    void Problem;
  });
});
