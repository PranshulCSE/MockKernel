import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import test from 'node:test';
import express, { type Express } from 'express';
import { errorHandler } from '../src/middleware/errorHandler.js';
import type { AuthenticatedRequest } from '../src/middleware/mockAuth.js';
import {
  buildRateLimitKey,
  computeTokenBucketStep,
  rateLimit,
  resolveRateLimitIdentifier,
  type RateLimitRedisClient,
} from '../src/middleware/rateLimiter.js';

function createInMemoryTokenBucketRedis(nowRef: {
  value: number;
}): RateLimitRedisClient {
  const buckets = new Map<string, { tokens: number; lastRefill: number }>();

  return {
    status: 'ready',
    async eval(
      _script: string,
      _numkeys: number,
      ...args: Array<string | number>
    ): Promise<[number, number, number]> {
      const key = String(args[0]);
      const capacity = Number(args[1]);
      const refillRatePerMs = Number(args[2]);
      const nowMs = Number(args[3] ?? nowRef.value);
      const requested = Number(args[4] ?? 1);
      const windowSeconds = capacity / (refillRatePerMs * 1000);

      const existing = buckets.get(key);
      const step = computeTokenBucketStep({
        currentTokens: existing ? existing.tokens : null,
        lastRefillMs: existing ? existing.lastRefill : null,
        capacity,
        windowSeconds,
        nowMs,
        requested,
      });

      buckets.set(key, { tokens: step.nextTokens, lastRefill: nowMs });
      return [step.allowed ? 1 : 0, step.remaining, step.retryAfterMs];
    },
  };
}

function invokeApp(
  app: Express,
  method: string,
  url: string,
  headers: Record<string, string> = {}
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
    req.headers = { ...headers };
    req.push(null);

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

test('computeTokenBucketStep: burst, exhaustion, and proportional refill', () => {
  const t0 = 1_000_000;

  const first = computeTokenBucketStep({
    currentTokens: null,
    lastRefillMs: null,
    capacity: 3,
    windowSeconds: 60,
    nowMs: t0,
  });
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 2);
  assert.equal(first.retryAfterMs, 0);

  const second = computeTokenBucketStep({
    currentTokens: first.nextTokens,
    lastRefillMs: t0,
    capacity: 3,
    windowSeconds: 60,
    nowMs: t0,
  });
  const third = computeTokenBucketStep({
    currentTokens: second.nextTokens,
    lastRefillMs: t0,
    capacity: 3,
    windowSeconds: 60,
    nowMs: t0,
  });
  assert.equal(third.allowed, true);
  assert.equal(third.remaining, 0);

  // 4th request at same timestamp is rejected; 1 token takes 20s (60s / 3)
  const fourth = computeTokenBucketStep({
    currentTokens: third.nextTokens,
    lastRefillMs: t0,
    capacity: 3,
    windowSeconds: 60,
    nowMs: t0,
  });
  assert.equal(fourth.allowed, false);
  assert.equal(fourth.retryAfterMs, 20_000);

  // After 20s, 1 token has refilled
  const afterRefill = computeTokenBucketStep({
    currentTokens: fourth.nextTokens,
    lastRefillMs: t0,
    capacity: 3,
    windowSeconds: 60,
    nowMs: t0 + 20_000,
  });
  assert.equal(afterRefill.allowed, true);
  assert.equal(afterRefill.remaining, 0);
});

test('key and identifier resolution respect policy keyBy', () => {
  const req = {
    ip: '10.0.0.5',
    authUser: { id: 'user-123', role: 'user' },
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as AuthenticatedRequest;

  assert.equal(resolveRateLimitIdentifier(req, 'userOrIp'), 'user:user-123');
  assert.equal(resolveRateLimitIdentifier(req, 'ip'), 'ip:10.0.0.5');
  assert.equal(
    buildRateLimitKey('submit', 'user:user-123'),
    'ratelimit:submit:user:user-123'
  );
});

test('rateLimit middleware blocks spam bursts with 429 + Retry-After and refills', async () => {
  const nowRef = { value: 5_000_000 };
  const mockRedis = createInMemoryTokenBucketRedis(nowRef);

  const app = express();
  app.post(
    '/submit',
    rateLimit('submit', {
      policy: { capacity: 2, windowSeconds: 10 },
      redisClient: mockRedis,
      now: () => nowRef.value,
    }),
    (_req, res) => res.status(202).json({ ok: true })
  );
  app.use(errorHandler);

  const [r1, r2, r3] = await Promise.all([
    invokeApp(app, 'POST', '/submit'),
    invokeApp(app, 'POST', '/submit'),
    invokeApp(app, 'POST', '/submit'),
  ]);

  const statuses = [r1.status, r2.status, r3.status].sort((a, b) => a - b);
  assert.deepEqual(statuses, [202, 202, 429]);

  const blocked = [r1, r2, r3].find((r) => r.status === 429);
  assert.ok(blocked);
  assert.equal(blocked.headers['retry-after'], '5');
  assert.equal(blocked.headers['x-ratelimit-limit'], '2');
  assert.equal(blocked.headers['x-ratelimit-remaining'], '0');
  const body = blocked.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'RATE_LIMITED');
  assert.match(body.error.message, /Slow down — try again in 5s\./);

  // Advance clock by 5s -> 1 token refills (2 tokens / 10s = 0.2 tok/s)
  nowRef.value += 5_000;
  const r4 = await invokeApp(app, 'POST', '/submit');
  assert.equal(r4.status, 202);
});

test('rateLimit middleware handles Redis outage via failOpen vs failClosed', async () => {
  const downRedis: RateLimitRedisClient = {
    status: 'reconnecting',
    async eval() {
      throw new Error('Connection is closed');
    },
  };

  const app = express();
  app.get(
    '/open',
    rateLimit('general', { redisClient: downRedis, failOpen: true }),
    (_req, res) => res.status(200).json({ ok: true })
  );
  app.get(
    '/closed',
    rateLimit('general', { redisClient: downRedis, failOpen: false }),
    (_req, res) => res.status(200).json({ ok: true })
  );
  app.use(errorHandler);

  const openRes = await invokeApp(app, 'GET', '/open');
  assert.equal(openRes.status, 200);

  const closedRes = await invokeApp(app, 'GET', '/closed');
  assert.equal(closedRes.status, 503);
  const body = closedRes.json() as { error: { code: string } };
  assert.equal(body.error.code, 'RATE_LIMITER_UNAVAILABLE');
});
