import mongoose from 'mongoose';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectDB } from '../src/config/db.js';
import { validateWorkerEnv } from '../src/config/env.js';
import { verifyRedisConnection } from '../src/config/redis.js';

describe('Worker startup configuration and connection error handling', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://127.0.0.1:27017/mockkernel_test',
      REDIS_HOST: '127.0.0.1',
      REDIS_PORT: '6379',
      JUDGE0_API_URL: 'http://localhost:2358',
      POLL_INTERVAL_MS: '500',
      MAX_POLL_ATTEMPTS: '10',
      WORKER_CONCURRENCY: '3',
    };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it('validates Worker environment configuration cleanly', () => {
    const config = validateWorkerEnv();
    expect(config.mongoUri).toBe('mongodb://127.0.0.1:27017/mockkernel_test');
    expect(config.redisPort).toBe(6379);
    expect(config.pollIntervalMs).toBe(500);
    expect(config.maxPollAttempts).toBe(10);
    expect(config.workerConcurrency).toBe(3);
  });

  it('defaults Judge0 polling to a 10s window', () => {
    delete process.env.POLL_INTERVAL_MS;
    delete process.env.MAX_POLL_ATTEMPTS;

    const config = validateWorkerEnv();

    expect(config.pollIntervalMs).toBe(1000);
    expect(config.maxPollAttempts).toBe(10);
    expect(config.pollIntervalMs * config.maxPollAttempts).toBe(10_000);
  });

  it('fails clearly on invalid or missing MONGODB_URI, REDIS_PORT, JUDGE0_API_URL, or worker settings', () => {
    process.env.MONGODB_URI = '';
    process.env.REDIS_PORT = 'bad-port';
    process.env.JUDGE0_API_URL = 'not-a-url';
    process.env.POLL_INTERVAL_MS = '1';
    process.env.MAX_POLL_ATTEMPTS = '0';
    process.env.WORKER_CONCURRENCY = '0';

    expect(() => validateWorkerEnv()).toThrow(/MONGODB_URI is required/);
    expect(() => validateWorkerEnv()).toThrow(/REDIS_PORT must be an integer/);
    expect(() => validateWorkerEnv()).toThrow(/JUDGE0_API_URL must be a valid/);
    expect(() => validateWorkerEnv()).toThrow(/POLL_INTERVAL_MS must be an integer/);
    expect(() => validateWorkerEnv()).toThrow(/MAX_POLL_ATTEMPTS must be an integer/);
    expect(() => validateWorkerEnv()).toThrow(/WORKER_CONCURRENCY must be an integer/);
  });

  it('connectDB throws clear errors without exiting the process and disables Mongoose buffering', async () => {
    expect(mongoose.get('bufferCommands')).toBe(false);
    await expect(connectDB('')).rejects.toThrow(/MONGODB_URI is not defined/);
    await expect(connectDB('http://invalid')).rejects.toThrow(/must start with "mongodb:\/\/"/);
  });

  it('verifyRedisConnection surfaces clear Redis errors', async () => {
    const brokenRedis = {
      status: 'wait',
      connect: vi.fn().mockRejectedValue(new Error('ECONNREFUSED 127.0.0.1:6379')),
      ping: vi.fn(),
    };

    await expect(verifyRedisConnection(brokenRedis as never)).rejects.toThrow(
      /Worker failed to connect to Redis: ECONNREFUSED/
    );
  });
});
