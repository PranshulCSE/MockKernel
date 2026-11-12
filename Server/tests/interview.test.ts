import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import test, { mock } from 'node:test';
import type { Express } from 'express';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { InterviewSession } from '../src/models/InterviewSession.js';
import { User } from '../src/models/User.js';
import { generateToken } from '../src/services/authService.js';
import { withRetry } from '../src/services/groqRetry.js';
import {
  generateNextQuestion,
  validateNextTurnPayload,
  type GroqClientLike,
} from '../src/services/groqService.js';

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

test('withRetry handles Groq 429 exponential backoff and skips non-retryable 400', async () => {
  const delays: number[] = [];
  let calls = 0;

  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) {
        throw { status: 429 };
      }
      return 'ok';
    },
    {
      maxRetries: 3,
      baseDelayMs: 100,
      sleep: async (ms) => {
        delays.push(ms);
      },
    }
  );

  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.equal(delays.length, 2);
  assert.ok((delays[0] ?? 0) >= 100);
  assert.ok((delays[1] ?? 0) >= 200);

  let nonRetryCalls = 0;
  await assert.rejects(
    () =>
      withRetry(
        async () => {
          nonRetryCalls++;
          throw { status: 400 };
        },
        { maxRetries: 3, sleep: async () => {} }
      ),
    (err: { status?: number }) => err.status === 400
  );
  assert.equal(nonRetryCalls, 1);
});

test('validateNextTurnPayload and generateNextQuestion repair malformed JSON once', async () => {
  const valid = validateNextTurnPayload(
    {
      evaluation: { score: 8, feedback: 'Good explanation of paging.' },
      nextQuestion: {
        question: 'What is thrashing?',
        topic: 'Operating Systems',
        difficulty: 'Hard',
      },
      isComplete: false,
    },
    {
      isInitial: false,
      expectComplete: false,
      allowedTopics: ['Operating Systems', 'DBMS'],
    }
  );
  assert.equal(valid.evaluation?.score, 8);
  assert.equal(valid.nextQuestion?.difficulty, 'Hard');

  // Simulated malformed first reply, valid repaired reply on retry
  let attempt = 0;
  const fakeGroq: GroqClientLike = {
    chat: {
      completions: {
        async create() {
          attempt++;
          if (attempt === 1) {
            return { choices: [{ message: { content: 'not valid json{' } }] };
          }
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    nextQuestion: {
                      question: 'Explain B-Tree indexing.',
                      topic: 'DBMS',
                      difficulty: 'Medium',
                    },
                    isComplete: false,
                  }),
                },
              },
            ],
          };
        },
      },
    },
  };

  const repaired = await generateNextQuestion(
    {
      topics: ['DBMS'],
      difficulty: 'Medium',
      questionCount: 5,
      history: [],
    },
    { client: fakeGroq }
  );
  assert.equal(attempt, 2);
  assert.equal(repaired.nextQuestion?.topic, 'DBMS');
});

test('interview routes validate topics, questionCount (1-20), and abandon flow', async (t) => {
  t.after(() => mock.restoreAll());
  process.env.JWT_SECRET = 'test-secret';
  const app = createApp();
  const userId = new Types.ObjectId();

  mock.method(User, 'findById', () =>
    mockQuery({ _id: userId, name: 'Candidate', email: 'c@test.com', role: 'user' })
  );
  const headers = { authorization: `Bearer ${generateToken(userId.toString(), 'user')}` };

  // Invalid topic -> 400
  const badTopic = await invokeApp(app, 'POST', '/api/interviews', {
    headers,
    body: { topics: ['Cooking'], difficulty: 'Easy', questionCount: 5 },
  });
  assert.equal(badTopic.status, 400);

  // Out-of-range questionCount -> 400
  const badCount = await invokeApp(app, 'POST', '/api/interviews', {
    headers,
    body: { topics: ['DBMS'], difficulty: 'Easy', questionCount: 25 },
  });
  assert.equal(badCount.status, 400);

  // Abandon in_progress session -> 200
  const sessionId = new Types.ObjectId();
  const sessionDoc = {
    _id: sessionId,
    id: sessionId.toString(),
    user: userId,
    status: 'in_progress',
    completedAt: undefined as Date | undefined,
    async save() {
      return this;
    },
  };
  mock.method(InterviewSession, 'findById', () => mockQuery(sessionDoc));

  const abandonRes = await invokeApp(
    app,
    'PATCH',
    `/api/interviews/${sessionId}/abandon`,
    { headers }
  );
  assert.equal(abandonRes.status, 200);
  assert.equal(sessionDoc.status, 'abandoned');
});
