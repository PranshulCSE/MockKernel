import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeTokenBucketStep,
  rateLimit,
} from '../src/middleware/rateLimiter.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestContext } from '../src/middleware/requestContext.js';
import { createTestApp, setupTestEnv } from './helpers.js';

describe('CORS, Security Headers, Input Sanitization, and Rate Limiting', () => {
  beforeEach(() => {
    setupTestEnv();
  });

  it('allows configured CORS origins and blocks disallowed origins', async () => {
    const app = createTestApp({
      corsOrigins: ['https://allowed.mockkernel.dev'],
    });

    const allowedRes = await request(app)
      .get('/')
      .set('Origin', 'https://allowed.mockkernel.dev');
    expect(allowedRes.status).toBe(200);
    expect(allowedRes.headers['access-control-allow-origin']).toBe(
      'https://allowed.mockkernel.dev'
    );

    const blockedRes = await request(app)
      .get('/')
      .set('Origin', 'https://evil.example.com');
    expect(blockedRes.status).toBe(403);
    expect(blockedRes.body.error.code).toBe('CORS_NOT_ALLOWED');
  });

  it('sets security headers and request IDs on responses', async () => {
    const app = createTestApp();
    const res = await request(app)
      .get('/')
      .set('X-Request-Id', 'trace-123');

    expect(res.status).toBe(200);
    expect(res.headers['x-request-id']).toBe('trace-123');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('rejects MongoDB operator injection and prototype pollution keys', async () => {
    const app = createTestApp();

    const bodyInjection = await request(app)
      .post('/api/auth/login')
      .send({ email: { $ne: '' }, password: 'secret' });
    expect(bodyInjection.status).toBe(400);
    expect(bodyInjection.body.error.code).toBe('UNSAFE_INPUT');

    const queryInjection = await request(app).get('/api/problems?title[$regex]=.*');
    expect(queryInjection.status).toBe(400);
    expect(queryInjection.body.error.code).toBe('UNSAFE_INPUT');
  });

  it('handles malformed JSON and oversized payloads without leaking stack traces', async () => {
    const app = createTestApp();

    const badJson = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(badJson.status).toBe(400);
    expect(badJson.body.error.code).toBe('INVALID_JSON');
    expect(badJson.body.error.stack).toBeUndefined();

    const oversized = await request(app)
      .post('/api/auth/login')
      .send({ data: 'a'.repeat(6 * 1024 * 1024) });
    expect(oversized.status).toBe(413);
    expect(oversized.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('computes token bucket refill and exhaustion accurately', () => {
    const first = computeTokenBucketStep({
      currentTokens: null,
      lastRefillMs: null,
      capacity: 5,
      windowSeconds: 60,
      nowMs: 1000,
    });
    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(4);

    const exhausted = computeTokenBucketStep({
      currentTokens: 0.2,
      lastRefillMs: 1000,
      capacity: 5,
      windowSeconds: 60,
      nowMs: 1000,
    });
    expect(exhausted.allowed).toBe(false);
    expect(exhausted.retryAfterMs).toBeGreaterThan(0);
  });

  it('rateLimit middleware enforces 429 + Retry-After and supports fail-open/closed on Redis outage', async () => {
    const evalMock = vi
      .fn()
      .mockResolvedValueOnce([1, 4, 0])
      .mockResolvedValueOnce([0, 0, 12_000]);

    const miniApp = express();
    miniApp.use(requestContext);
    miniApp.get(
      '/limited',
      rateLimit('auth', {
        redisClient: { eval: evalMock, status: 'ready' } as never,
      }),
      (_req, res) => {
        res.status(200).json({ ok: true });
      }
    );
    miniApp.get(
      '/fail-closed',
      rateLimit('auth', {
        redisClient: { eval: vi.fn(), status: 'reconnecting' } as never,
        failOpen: false,
      }),
      (_req, res) => {
        res.status(200).json({ ok: true });
      }
    );
    miniApp.use(errorHandler);

    const okRes = await request(miniApp).get('/limited');
    expect(okRes.status).toBe(200);
    expect(okRes.headers['x-ratelimit-limit']).toBe('20');
    expect(okRes.headers['x-ratelimit-remaining']).toBe('4');

    const limitedRes = await request(miniApp).get('/limited');
    expect(limitedRes.status).toBe(429);
    expect(limitedRes.headers['retry-after']).toBe('12');
    expect(limitedRes.body.error.code).toBe('RATE_LIMITED');

    const outageRes = await request(miniApp).get('/fail-closed');
    expect(outageRes.status).toBe(503);
    expect(outageRes.body.error.code).toBe('RATE_LIMITER_UNAVAILABLE');
  });
});
