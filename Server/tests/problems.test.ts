import mongoose, { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Contest } from '../src/models/Contest.js';
import { Problem } from '../src/models/Problem.js';
import { TestCase } from '../src/models/TestCase.js';
import { User } from '../src/models/User.js';
import {
  createTestApp,
  makeToken,
  mockMongooseQuery,
  setupTestEnv,
} from './helpers.js';

describe('Problems & TestCases CRUD, Validation, and Transactions', () => {
  const adminId = new Types.ObjectId();
  let adminToken: string;

  beforeEach(() => {
    setupTestEnv();
    adminToken = makeToken(adminId.toString(), 'admin');
    vi.spyOn(User, 'findById').mockReturnValue(
      mockMongooseQuery({
        _id: adminId,
        name: 'Admin',
        email: 'admin@example.com',
        role: 'admin',
      }) as never
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists only published problems with pagination and validates query params', async () => {
    const app = createTestApp();

    const invalidPage = await request(app).get('/api/problems?page=0');
    expect(invalidPage.status).toBe(400);
    expect(invalidPage.body.error.code).toBe('VALIDATION_ERROR');

    const invalidDifficulty = await request(app).get('/api/problems?difficulty=Impossible');
    expect(invalidDifficulty.status).toBe(400);

    const probId = new Types.ObjectId();
    const findSpy = vi.spyOn(Problem, 'find').mockReturnValue(
      mockMongooseQuery([
        {
          id: probId.toString(),
          title: 'Two Sum',
          difficulty: 'Easy',
          supportedLanguages: ['python', 'javascript'],
          createdAt: new Date(),
        },
      ]) as never
    );
    vi.spyOn(Problem, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(1),
    } as never);

    const res = await request(app).get('/api/problems?page=1&limit=10&difficulty=Easy');
    expect(res.status).toBe(200);
    expect(findSpy).toHaveBeenCalledWith(
      expect.objectContaining({ isPublished: true, difficulty: 'Easy' })
    );
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination).toEqual({
      page: 1,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });

  it('validates ObjectId and preserves sample test-case ordering without leaking hidden cases', async () => {
    const app = createTestApp();

    const badId = await request(app).get('/api/problems/not-an-object-id');
    expect(badId.status).toBe(400);
    expect(badId.body.error.code).toBe('INVALID_ID');

    const missingId = new Types.ObjectId().toString();
    vi.spyOn(Problem, 'findOne').mockReturnValue(mockMongooseQuery(null) as never);
    const notFound = await request(app).get(`/api/problems/${missingId}`);
    expect(notFound.status).toBe(404);
    expect(notFound.body.error.code).toBe('PROBLEM_NOT_FOUND');

    const probId = new Types.ObjectId();
    vi.spyOn(Problem, 'findOne').mockReturnValue(
      mockMongooseQuery({
        id: probId.toString(),
        _id: probId,
        title: 'Echo',
        statement: 'Echo input',
        difficulty: 'Easy',
        constraints: 'N <= 100',
        supportedLanguages: ['python'],
        starterCode: { python: 'print(input())' },
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as never
    );
    const tcQuery = mockMongooseQuery([
      {
        id: new Types.ObjectId().toString(),
        input: '',
        expectedOutput: '',
        isSample: true,
        order: 0,
      },
      {
        id: new Types.ObjectId().toString(),
        input: 'hi',
        expectedOutput: 'hi',
        isSample: true,
        order: 1,
      },
    ]);
    const tcFindSpy = vi.spyOn(TestCase, 'find').mockReturnValue(tcQuery as never);

    const okRes = await request(app).get(`/api/problems/${probId.toString()}`);
    expect(okRes.status).toBe(200);
    expect(tcFindSpy).toHaveBeenCalledWith({ problem: probId, isSample: true });
    expect(tcQuery.sort).toHaveBeenCalledWith({ order: 1 });
    expect(okRes.body.data.sampleTestCases).toHaveLength(2);
    expect(okRes.body.data.sampleTestCases[0].input).toBe('');
    expect(okRes.body.data.sampleTestCases[0].expectedOutput).toBe('');
  });

  it('rejects duplicate test-case orders and creates problems with empty test case strings in a transaction', async () => {
    const app = createTestApp();

    const dupOrderRes = await request(app)
      .post('/api/admin/problems')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Duplicate Order Problem',
        statement: 'Solve it',
        difficulty: 'Easy',
        constraints: '1 <= N <= 10',
        supportedLanguages: ['python'],
        testCases: [
          { input: '1', expectedOutput: '1', isSample: true, order: 0 },
          { input: '2', expectedOutput: '2', isSample: false, order: 0 },
        ],
      });

    expect(dupOrderRes.status).toBe(400);
    expect(dupOrderRes.body.error.code).toBe('VALIDATION_ERROR');
    expect(dupOrderRes.body.error.message).toMatch(/Duplicate test case order/);

    const fakeSession = {
      withTransaction: vi.fn(async (cb: () => Promise<void>) => cb()),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(fakeSession as never);

    const saveSpy = vi.spyOn(Problem.prototype, 'save').mockImplementation(function (
      this: { _id: Types.ObjectId }
    ) {
      return Promise.resolve(this as never);
    });
    const insertManySpy = vi
      .spyOn(TestCase, 'insertMany')
      .mockResolvedValue([] as never);
    vi.spyOn(TestCase, 'find').mockReturnValue(mockMongooseQuery([]) as never);

    const createRes = await request(app)
      .post('/api/admin/problems')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Empty Output Problem',
        statement: 'Return empty string',
        difficulty: 'Medium',
        constraints: 'None',
        supportedLanguages: ['python'],
        isPublished: true,
        testCases: [
          { input: '', expectedOutput: '', isSample: true, order: 0 },
        ],
      });

    expect(createRes.status).toBe(201);
    expect(fakeSession.withTransaction).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalled();
    expect(insertManySpy).toHaveBeenCalledWith(
      [expect.objectContaining({ input: '', expectedOutput: '', order: 0 })],
      expect.objectContaining({ session: fakeSession })
    );
  });

  it('prevents deleting a problem used by a live contest and deletes unused problem in transaction', async () => {
    const app = createTestApp();
    const probId = new Types.ObjectId();

    const fakeSession = {
      withTransaction: vi.fn(async (cb: () => Promise<void>) => cb()),
      endSession: vi.fn().mockResolvedValue(undefined),
    };
    vi.spyOn(mongoose, 'startSession').mockResolvedValue(fakeSession as never);
    vi.spyOn(Problem, 'findById').mockReturnValue(
      mockMongooseQuery({ _id: probId, id: probId.toString() }) as never
    );

    vi.spyOn(Contest, 'exists').mockReturnValue(
      mockMongooseQuery({ _id: new Types.ObjectId() }) as never
    );

    const blockedRes = await request(app)
      .delete(`/api/admin/problems/${probId.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(blockedRes.status).toBe(409);
    expect(blockedRes.body.error.code).toBe('PROBLEM_IN_LIVE_CONTEST');

    vi.spyOn(Contest, 'exists').mockReturnValue(mockMongooseQuery(null) as never);
    const tcDelSpy = vi
      .spyOn(TestCase, 'deleteMany')
      .mockReturnValue(mockMongooseQuery({ deletedCount: 2 }) as never);
    const probDelSpy = vi
      .spyOn(Problem, 'deleteOne')
      .mockReturnValue(mockMongooseQuery({ deletedCount: 1 }) as never);

    const okRes = await request(app)
      .delete(`/api/admin/problems/${probId.toString()}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(okRes.status).toBe(204);
    expect(tcDelSpy).toHaveBeenCalledWith(
      { problem: probId },
      { session: fakeSession }
    );
    expect(probDelSpy).toHaveBeenCalledWith(
      { _id: probId },
      { session: fakeSession }
    );
  });
});
