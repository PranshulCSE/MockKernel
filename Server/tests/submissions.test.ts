import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import test, { mock } from 'node:test';
import type { Express } from 'express';
import { Types } from 'mongoose';
import type { Server } from 'socket.io';
import { createApp } from '../src/app.js';
import { redis } from '../src/config/redis.js';
import { Contest } from '../src/models/Contest.js';
import { ContestParticipant } from '../src/models/ContestParticipant.js';
import { Problem } from '../src/models/Problem.js';
import { Submission } from '../src/models/Submission.js';
import { TestCase } from '../src/models/TestCase.js';
import { User, type UserRole } from '../src/models/User.js';
import { generateToken } from '../src/services/authService.js';
import { handleSubmissionCompleted } from '../src/services/verdictEmitter.js';

function mockQuery<T>(result: T) {
  return {
    select() {
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
    mockQuery({ _id: new Types.ObjectId(userId), name: 'User', email: 'u@test.com', role })
  );
  return { authorization: `Bearer ${generateToken(userId, role)}` };
}

function invokeApp(
  app: Express,
  method: string,
  url: string,
  options: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<{ status: number; json: () => unknown }> {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough() as unknown as Socket;
    Object.defineProperty(socket, 'remoteAddress', { value: '127.0.0.1', configurable: true });
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
      resolve({ status: res.statusCode, json: () => (raw ? JSON.parse(raw) : null) });
    };

    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const r = (origEnd as (...args: unknown[]) => ServerResponse)(chunk, ...rest);
      queueMicrotask(finish);
      return r;
    }) as typeof res.end;

    res.on('error', reject);
    (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
  });
}

test('POST /api/submissions validates language, code size, and hides hidden outputs on GET', async (t) => {
  t.after(() => mock.restoreAll());
  const app = createApp();
  const userId = new Types.ObjectId();
  const otherUserId = new Types.ObjectId();
  const problemId = new Types.ObjectId();
  const headers = authHeadersFor(userId.toString(), 'user');

  // Oversized code > 100KB -> 400
  const tooBig = await invokeApp(app, 'POST', '/api/submissions', {
    headers,
    body: {
      problemId: problemId.toString(),
      language: 'python',
      mode: 'run',
      sourceCode: 'x'.repeat(101 * 1024),
    },
  });
  assert.equal(tooBig.status, 400);
  assert.equal((tooBig.json() as { error: { code: string } }).error.code, 'SOURCE_TOO_LARGE');

  // Unsupported language for problem -> 400
  mock.method(Problem, 'findOne', () =>
    mockQuery({ _id: problemId, supportedLanguages: ['python'] })
  );
  const badLang = await invokeApp(app, 'POST', '/api/submissions', {
    headers,
    body: {
      problemId: problemId.toString(),
      language: 'cpp',
      mode: 'run',
      sourceCode: 'int main() {}',
    },
  });
  assert.equal(badLang.status, 400);
  assert.equal((badLang.json() as { error: { code: string } }).error.code, 'UNSUPPORTED_LANGUAGE');

  // GET /api/submissions/:id strips hidden stdout/stderr in submit mode and denies other users
  const subId = new Types.ObjectId();
  mock.method(Submission, 'findById', () =>
    mockQuery({
      id: subId.toString(),
      user: userId,
      problem: problemId,
      language: 'python',
      mode: 'submit',
      verdict: 'WRONG_ANSWER',
      testCaseResults: [
        {
          testCase: new Types.ObjectId(),
          passed: false,
          verdict: 'WRONG_ANSWER',
          runtime: 12,
          memory: 1024,
          stdout: 'SECRET_HIDDEN_OUT',
          stderr: 'SECRET_ERR',
        },
      ],
      createdAt: new Date(),
      updatedAt: new Date(),
    })
  );

  const pollRes = await invokeApp(app, 'GET', `/api/submissions/${subId}`, { headers });
  assert.equal(pollRes.status, 200);
  const pollBody = pollRes.json() as {
    data: { testCaseResults: Array<Record<string, unknown>> };
  };
  assert.equal(pollBody.data.testCaseResults[0]?.stdout, undefined);
  assert.equal(pollBody.data.testCaseResults[0]?.stderr, undefined);
  assert.equal(pollBody.data.testCaseResults[0]?.passed, false);

  // Other user blocked with 403
  const otherHeaders = authHeadersFor(otherUserId.toString(), 'user');
  const forbiddenPoll = await invokeApp(app, 'GET', `/api/submissions/${subId}`, {
    headers: otherHeaders,
  });
  assert.equal(forbiddenPoll.status, 403);
});

test('POST /api/submissions enforces contest membership and active submission cap', async (t) => {
  t.after(() => mock.restoreAll());
  const app = createApp();
  const userId = new Types.ObjectId();
  const problemId = new Types.ObjectId();
  const contestId = new Types.ObjectId();
  const headers = authHeadersFor(userId.toString(), 'user');

  mock.method(Problem, 'findOne', () =>
    mockQuery({ _id: problemId, supportedLanguages: ['python'] })
  );
  mock.method(Contest, 'findById', () =>
    mockQuery({
      _id: contestId,
      status: 'live',
      startTime: new Date(Date.now() - 60_000),
      endTime: new Date(Date.now() + 60_000),
      problems: [{ problem: problemId, points: 100, order: 0 }],
    })
  );
  mock.method(ContestParticipant, 'findOne', () => mockQuery(null));

  const notJoined = await invokeApp(app, 'POST', '/api/submissions', {
    headers,
    body: {
      problemId: problemId.toString(),
      contestId: contestId.toString(),
      language: 'python',
      mode: 'submit',
      sourceCode: 'print(1)',
    },
  });
  assert.equal(notJoined.status, 403);
  assert.equal(
    (notJoined.json() as { error: { code: string } }).error.code,
    'NOT_CONTEST_PARTICIPANT'
  );

  // Active submissions >= 5 -> 429
  mock.method(ContestParticipant, 'findOne', () => mockQuery({ isDisqualified: false }));
  mock.method(Submission, 'countDocuments', () => mockQuery(5));
  const capped = await invokeApp(app, 'POST', '/api/submissions', {
    headers,
    body: {
      problemId: problemId.toString(),
      contestId: contestId.toString(),
      language: 'python',
      mode: 'submit',
      sourceCode: 'print(1)',
    },
  });
  assert.equal(capped.status, 429);
  void TestCase;
});

test('handleSubmissionCompleted emits verdict:update and leaderboard:update for safe Accepted contest submission', async (t) => {
  t.after(() => mock.restoreAll());
  const subId = new Types.ObjectId();
  const userId = new Types.ObjectId();
  const problemId = new Types.ObjectId();
  const contestId = new Types.ObjectId();

  const submissionDoc = {
    _id: subId,
    id: subId.toString(),
    user: userId,
    problem: problemId,
    contest: contestId,
    language: 'python' as const,
    sourceCode: 'print(42)', // < 50 chars -> skipped by plagiarism check
    mode: 'submit' as const,
    verdict: 'ACCEPTED' as const,
    runtime: 20,
    memory: 512,
    async save() {
      return this;
    },
  };

  mock.method(Submission, 'findById', () => mockQuery(submissionDoc));
  mock.method(Contest, 'findById', () =>
    mockQuery({
      _id: contestId,
      status: 'live',
      problems: [{ problem: problemId, points: 100, order: 0 }],
    })
  );
  mock.method(ContestParticipant, 'findOne', () => mockQuery({ isDisqualified: false }));
  mock.method(Submission, 'exists', () => mockQuery(null));
  mock.method(redis, 'sadd', async () => 1);
  mock.method(redis, 'zincrby', async () => '100');
  mock.method(redis, 'zcard', async () => 1);
  mock.method(redis, 'zrevrange', async () => [userId.toString(), '100']);
  mock.method(User, 'find', () => mockQuery([{ _id: userId, name: 'Alice' }]));

  const emitted: Array<{ room: string; event: string; payload: unknown }> = [];
  const fakeIo = {
    to(room: string) {
      return {
        emit(event: string, payload: unknown) {
          emitted.push({ room, event, payload });
        },
      };
    },
  } as unknown as Server;

  await handleSubmissionCompleted(subId.toString(), fakeIo);

  assert.equal(emitted.length, 2);
  assert.equal(emitted[0]?.room, `contest:${contestId}`);
  assert.equal(emitted[0]?.event, 'leaderboard:update');
  assert.equal(emitted[1]?.room, `user:${userId}`);
  assert.equal(emitted[1]?.event, 'verdict:update');
});
