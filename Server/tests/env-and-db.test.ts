import mongoose from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDB } from '../src/config/db.js';
import { validateEnv } from '../src/config/env.js';
import { createApp } from '../src/app.js';
import { setupTestEnv } from './helpers.js';

describe('Startup configuration, MongoDB connection, and Health endpoints', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    setupTestEnv();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('validates valid environment configuration', () => {
    const config = validateEnv();
    expect(config.mongoUri).toBe('mongodb://127.0.0.1:27017/mockkernel_test');
    expect(config.corsOrigins).toEqual([
      'http://localhost:5173',
      'https://app.mockkernel.dev',
    ]);
    expect(config.plagiarismThreshold).toBe(0.85);
  });

  it('fails startup clearly when MONGODB_URI or JWT_SECRET is missing or invalid', () => {
    process.env.MONGODB_URI = '';
    process.env.JWT_SECRET = '';
    expect(() => validateEnv()).toThrow(/MONGODB_URI is required/);
    expect(() => validateEnv()).toThrow(/JWT_SECRET is required/);

    process.env.MONGODB_URI = 'http://not-mongo';
    process.env.JWT_SECRET = 'short';
    expect(() => validateEnv()).toThrow(/must start with "mongodb:\/\/"/);
    expect(() => validateEnv()).toThrow(/JWT_SECRET must be at least 8 characters/);
  });

  it('rejects invalid PORT, REDIS_PORT, JUDGE0_API_URL, CORS_ORIGINS, and PLAGIARISM_THRESHOLD', () => {
    process.env.PORT = '99999';
    process.env.REDIS_PORT = 'abc';
    process.env.JUDGE0_API_URL = 'ftp://bad';
    process.env.CORS_ORIGINS = 'not-a-url';
    process.env.PLAGIARISM_THRESHOLD = '2';

    expect(() => validateEnv()).toThrow(/PORT must be an integer/);
    expect(() => validateEnv()).toThrow(/REDIS_PORT must be an integer/);
    expect(() => validateEnv()).toThrow(/JUDGE0_API_URL must be a valid/);
    expect(() => validateEnv()).toThrow(/Invalid CORS origin/);
    expect(() => validateEnv()).toThrow(/PLAGIARISM_THRESHOLD must be a number/);
  });

  it('connectDB fails clearly on missing or invalid URI and disables Mongoose buffering', async () => {
    expect(mongoose.get('bufferCommands')).toBe(false);
    await expect(connectDB('')).rejects.toThrow(/MONGODB_URI is not defined/);
    await expect(connectDB('postgres://localhost/db')).rejects.toThrow(
      /must start with "mongodb:\/\/"/
    );
  });

  it('GET /health reports 503 when MongoDB is disconnected and 200 when connected', async () => {
    const appDisconnected = createApp({
      checkDbReadiness: () => false,
    });
    const resDown = await request(appDisconnected).get('/health');
    expect(resDown.status).toBe(503);
    expect(resDown.body.status).toBe('degraded');
    expect(resDown.body.database).toBe('disconnected');

    const readySpy = vi
      .spyOn(mongoose.connection, 'readyState', 'get')
      .mockReturnValue(1);
    const resUp = await request(appDisconnected).get('/health');
    expect(resUp.status).toBe(200);
    expect(resUp.body.status).toBe('ok');
    expect(resUp.body.database).toBe('connected');
    readySpy.mockRestore();
  });

  it('GET /health/ready checks MongoDB, Redis, and Judge0', async () => {
    const healthyApp = createApp({
      checkDbReadiness: () => true,
      healthDeps: {
        checkDbPing: async () => true,
        checkRedisPing: async () => true,
        checkJudge0: async () => ({ ok: true, status: 200 }),
      },
    });
    const okRes = await request(healthyApp).get('/health/ready');
    expect(okRes.status).toBe(200);
    expect(okRes.body.status).toBe('ready');
    expect(okRes.body.checks.mongodb.status).toBe('ok');
    expect(okRes.body.checks.redis.status).toBe('ok');
    expect(okRes.body.checks.judge0.status).toBe('ok');

    const degradedApp = createApp({
      checkDbReadiness: () => true,
      healthDeps: {
        checkDbPing: async () => true,
        checkRedisPing: async () => false,
        checkJudge0: async () => ({ ok: false, message: 'ECONNREFUSED' }),
      },
    });
    const failRes = await request(degradedApp).get('/ready');
    expect(failRes.status).toBe(503);
    expect(failRes.body.status).toBe('not_ready');
    expect(failRes.body.checks.redis.status).toBe('unavailable');
    expect(failRes.body.checks.judge0.status).toBe('unavailable');
  });

  it('rejects /api requests immediately with 503 when database is disconnected without hanging', async () => {
    const app = createApp({
      checkDbReadiness: () => false,
    });
    const res = await request(app).get('/api/problems');
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('DATABASE_UNAVAILABLE');
    expect(typeof res.body.error.requestId).toBe('string');
  });
});
