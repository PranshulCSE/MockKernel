import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import test, { mock } from 'node:test';
import type { Express } from 'express';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { redis } from '../src/config/redis.js';
import { isValidContestTransition } from '../src/controllers/contestController.js';
import { Contest } from '../src/models/Contest.js';
import { ContestParticipant } from '../src/models/ContestParticipant.js';
import { Problem } from '../src/models/Problem.js';
import { Submission } from '../src/models/Submission.js';
import { User, type UserRole } from '../src/models/User.js';
import { generateToken } from '../src/services/authService.js';

function mockQuery<T>(result: T) {
  return {
    select() {
      return this;
    },
    populate() {
      return this;
    },
    sort() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    lean() {
      return this;
    },
    async exec() {
      return result;
    },
  };
}

function authHeadersFor(userId: string, role: UserRole): Record<string, string> {
  process.env.JWT_SECRET = 'test-jwt-secret';
  mock.method(User, 'findById', () =>
    mockQuery({
      _id: new Types.ObjectId(userId),
      name: `Test ${role}`,
      email: `${role}@mockkernel.test`,
      role,
    })
  );
  const token = generateToken(userId, role);
  return { authorization: `Bearer ${token}` };
}

function invokeApp(
  app: Express,
  method: string,
  url: string,
  options: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<{
  status: number;
  headers: Record<string, string | string[] | number | undefined>;
  json: () => unknown;
}> {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough() as unknown as Socket;
    Object.defineProperty(socket, 'remoteAddress', {
      value: '127.0.0.1',
      configurable: true,
    });

    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    const headers: Record<string, string> = { ...(options.headers ?? {}) };

    if (options.body !== undefined) {
      const payload = Buffer.from(JSON.stringify(options.body), 'utf8');
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(payload.length);
      req.headers = headers;
      req.push(payload);
      req.push(null);
    } else {
      req.headers = headers;
      req.push(null);
    }

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve({
        status: res.statusCode,
        headers: res.getHeaders(),
        json: () => (raw ? JSON.parse(raw) : null),
      });
    };

    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
        );
      }
      return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (
        chunk !== undefined &&
        chunk !== null &&
        typeof chunk !== 'function'
      ) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk))
        );
      }
      const result = (origEnd as (...args: unknown[]) => ServerResponse)(
        chunk,
        ...rest
      );
      queueMicrotask(finish);
      return result;
    }) as typeof res.end;

    res.on('error', reject);
    (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(
      req,
      res
    );
  });
}

test('isValidContestTransition enforces draft -> live -> ended lifecycle', () => {
  assert.equal(isValidContestTransition('draft', 'live'), true);
  assert.equal(isValidContestTransition('live', 'ended'), true);
  assert.equal(isValidContestTransition('draft', 'ended'), false);
  assert.equal(isValidContestTransition('live', 'draft'), false);
  assert.equal(isValidContestTransition('ended', 'live'), false);
});

test('admin contest routes enforce role guard, validation, and creation', async (t) => {
  t.after(() => mock.restoreAll());
  const app = createApp();
  const userId = new Types.ObjectId().toString();
  const problemId = new Types.ObjectId();

  // Non-admin rejected with 403
  const forbiddenRes = await invokeApp(app, 'POST', '/api/admin/contests', {
    headers: authHeadersFor(userId, 'user'),
    body: {},
  });
  assert.equal(forbiddenRes.status, 403);

  const adminHeaders = authHeadersFor(userId, 'admin');

  // Invalid date range (endTime <= startTime) rejected with 400
  const badDatesRes = await invokeApp(app, 'POST', '/api/admin/contests', {
    headers: adminHeaders,
    body: {
      title: 'Weekly Contest 1',
      description: 'Test contest',
      startTime: '2026-12-01T12:00:00Z',
      endTime: '2026-12-01T10:00:00Z',
      problems: [{ problemId: problemId.toString(), points: 100, order: 0 }],
    },
  });
  assert.equal(badDatesRes.status, 400);

  // Valid create returns 201
  mock.method(Problem, 'find', () =>
    mockQuery([
      {
        _id: problemId,
        title: 'Two Sum',
        difficulty: 'Easy',
        supportedLanguages: ['python', 'cpp'],
        isPublished: true,
      },
    ])
  );
  const createdContestId = new Types.ObjectId();
  mock.method(Contest, 'create', async (doc: Record<string, unknown>) => ({
    ...doc,
    _id: createdContestId,
    id: createdContestId.toString(),
    createdAt: new Date(),
    updatedAt: new Date(),
  }));

  const createRes = await invokeApp(app, 'POST', '/api/admin/contests', {
    headers: adminHeaders,
    body: {
      title: 'Weekly Contest 1',
      description: 'Test contest',
      startTime: '2026-12-01T10:00:00Z',
      endTime: '2026-12-01T12:00:00Z',
      problems: [{ problemId: problemId.toString(), points: 100, order: 0 }],
    },
  });
  assert.equal(createRes.status, 201);
  const createdBody = createRes.json() as {
    data: { id: string; status: string; problems: Array<{ title: string }> };
  };
  assert.equal(createdBody.data.id, createdContestId.toString());
  assert.equal(createdBody.data.status, 'draft');
  assert.equal(createdBody.data.problems[0]?.title, 'Two Sum');
});

test('admin status transition, edit guard, flagged list, and disqualify flow', async (t) => {
  t.after(() => mock.restoreAll());
  const app = createApp();
  const adminId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId();
  const contestId = new Types.ObjectId();
  const problemId = new Types.ObjectId();
  const adminHeaders = authHeadersFor(adminId, 'admin');

  mock.method(Contest, 'findById', () =>
    mockQuery({
      _id: contestId,
      id: contestId.toString(),
      status: 'live',
      problems: [{ problem: problemId, points: 100, order: 0 }],
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 3_600_000),
    })
  );

  const editLive = await invokeApp(
    app,
    'PATCH',
    `/api/admin/contests/${contestId}`,
    {
      headers: adminHeaders,
      body: { title: 'Updated Title' },
    }
  );
  assert.equal(editLive.status, 409);

  const badTransition = await invokeApp(
    app,
    'PATCH',
    `/api/admin/contests/${contestId}/status`,
    {
      headers: adminHeaders,
      body: { status: 'draft' },
    }
  );
  assert.equal(badTransition.status, 409);

  // Flagged submissions listing
  const flaggedSubId = new Types.ObjectId();
  mock.method(Submission, 'find', () =>
    mockQuery([
      {
        _id: flaggedSubId,
        user: { _id: userId, name: 'Cheater', email: 'c@test.com' },
        problem: { _id: problemId, title: 'Two Sum', difficulty: 'Easy' },
        language: 'python',
        plagiarism: { flagged: true, similarity: 0.94 },
        createdAt: new Date(),
      },
    ])
  );
  mock.method(Submission, 'countDocuments', () => mockQuery(1));

  const flaggedRes = await invokeApp(
    app,
    'GET',
    `/api/admin/contests/${contestId}/flagged`,
    { headers: adminHeaders }
  );
  assert.equal(flaggedRes.status, 200);
  const flaggedBody = flaggedRes.json() as {
    data: Array<{ submissionId: string; similarity: number }>;
  };
  assert.equal(flaggedBody.data[0]?.submissionId, flaggedSubId.toString());
  assert.equal(flaggedBody.data[0]?.similarity, 0.94);

  // Disqualify participant removes them from Redis ZSET
  mock.method(ContestParticipant, 'findOneAndUpdate', () =>
    mockQuery({ contest: contestId, user: userId, isDisqualified: true })
  );
  const zremSpy = mock.method(redis, 'zrem', async () => 1);
  const delSpy = mock.method(redis, 'del', async () => 1);

  const dqRes = await invokeApp(
    app,
    'PATCH',
    `/api/admin/contests/${contestId}/participants/${userId}/disqualify`,
    { headers: adminHeaders }
  );
  assert.equal(dqRes.status, 200);
  assert.equal(zremSpy.mock.callCount(), 1);
  assert.equal(delSpy.mock.callCount(), 1);
});

test('join and leave contest handle happy path, duplicate join (409), and submission guard', async (t) => {
  t.after(() => mock.restoreAll());
  const app = createApp();
  const contestId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const userHeaders = authHeadersFor(userId.toString(), 'user');

  mock.method(Contest, 'findById', () =>
    mockQuery({
      _id: contestId,
      id: contestId.toString(),
      status: 'live',
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 3_600_000),
    })
  );

  let joined = false;
  mock.method(ContestParticipant, 'create', async () => {
    if (joined) {
      const dupErr = Object.assign(new Error('E11000 duplicate key'), {
        code: 11000,
      });
      throw dupErr;
    }
    joined = true;
    return {
      contest: contestId,
      user: userId,
      joinedAt: new Date(),
      isDisqualified: false,
    };
  });

  const join1 = await invokeApp(app, 'POST', `/api/contests/${contestId}/join`, {
    headers: userHeaders,
  });
  assert.equal(join1.status, 201);

  const join2 = await invokeApp(app, 'POST', `/api/contests/${contestId}/join`, {
    headers: userHeaders,
  });
  assert.equal(join2.status, 409);
  const dupBody = join2.json() as { error: { code: string } };
  assert.equal(dupBody.error.code, 'ALREADY_JOINED');

  mock.method(ContestParticipant, 'findOne', () =>
    mockQuery({ _id: new Types.ObjectId(), isDisqualified: false })
  );
  mock.method(Submission, 'exists', () => mockQuery({ _id: new Types.ObjectId() }));

  const leaveBlocked = await invokeApp(
    app,
    'POST',
    `/api/contests/${contestId}/leave`,
    { headers: userHeaders }
  );
  assert.equal(leaveBlocked.status, 409);
  const leaveBody = leaveBlocked.json() as { error: { code: string } };
  assert.equal(leaveBody.error.code, 'CANNOT_LEAVE_WITH_SUBMISSIONS');
});

test('GET /api/contests/:id/leaderboard returns ranked entries from Redis', async (t) => {
  t.after(() => mock.restoreAll());
  const app = createApp();
  const contestId = new Types.ObjectId();
  const u1 = new Types.ObjectId();
  const u2 = new Types.ObjectId();

  mock.method(Contest, 'findOne', () =>
    mockQuery({ _id: contestId, title: 'Weekly 1', status: 'live' })
  );
  mock.method(redis, 'zcard', async () => 2);
  mock.method(redis, 'zrevrange', async () => [
    u1.toString(),
    '300',
    u2.toString(),
    '100',
  ]);
  mock.method(User, 'find', () =>
    mockQuery([
      { _id: u1, name: 'Alice' },
      { _id: u2, name: 'Bob' },
    ])
  );

  const res = await invokeApp(
    app,
    'GET',
    `/api/contests/${contestId}/leaderboard?page=1&limit=10`
  );
  assert.equal(res.status, 200);
  const body = res.json() as {
    data: { entries: Array<{ rank: number; name: string; score: number }> };
    pagination: { total: number };
  };
  assert.deepEqual(body.data.entries, [
    { rank: 1, userId: u1.toString(), name: 'Alice', score: 300 },
    { rank: 2, userId: u2.toString(), name: 'Bob', score: 100 },
  ]);
  assert.equal(body.pagination.total, 2);
});

test('contest route enforces 429 rate limiting when Redis bucket is exhausted', async (t) => {
  const originalStatusDesc = Object.getOwnPropertyDescriptor(redis, 'status');
  t.after(() => {
    mock.restoreAll();
    if (originalStatusDesc) {
      Object.defineProperty(redis, 'status', originalStatusDesc);
    } else {
      delete (redis as { status?: string }).status;
    }
  });

  Object.defineProperty(redis, 'status', {
    value: 'ready',
    configurable: true,
  });
  mock.method(redis, 'eval', async () => [0, 0, 12_000]);

  const app = createApp();
  const contestId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();
  const userHeaders = authHeadersFor(userId, 'user');

  const res = await invokeApp(app, 'POST', `/api/contests/${contestId}/join`, {
    headers: userHeaders,
  });

  assert.equal(res.status, 429);
  assert.equal(res.headers['retry-after'], '12');
  const body = res.json() as {
    error: { code: string; message: string; details: { retryAfter: number } };
  };
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.equal(body.error.details.retryAfter, 12);
});
