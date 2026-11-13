import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

let envLoaded = false;

export function loadWorkerEnv(): void {
  if (envLoaded) {
    return;
  }
  envLoaded = true;

  const localEnv = resolve(process.cwd(), '.env');
  const rootEnv = resolve(process.cwd(), '../.env');

  if (existsSync(localEnv)) {
    dotenv.config({ path: localEnv, quiet: true });
  }
  if (existsSync(rootEnv)) {
    dotenv.config({ path: rootEnv, quiet: true });
  }
}

export interface WorkerEnvConfig {
  nodeEnv: string;
  mongoUri: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  redisUrl?: string;
  judge0ApiUrl: string;
  judge0ApiKey?: string;
  submissionQueueName: string;
  pollIntervalMs: number;
  maxPollAttempts: number;
  workerConcurrency: number;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateWorkerEnv(): WorkerEnvConfig {
  loadWorkerEnv();

  const errors: string[] = [];
  const mongoUri = process.env.MONGODB_URI?.trim() || '';

  if (!mongoUri) {
    errors.push('MONGODB_URI is required.');
  } else if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    errors.push('MONGODB_URI must start with "mongodb://" or "mongodb+srv://".');
  }

  if (process.env.REDIS_PORT !== undefined && process.env.REDIS_PORT.trim() !== '') {
    const port = Number(process.env.REDIS_PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.push('REDIS_PORT must be an integer between 1 and 65535.');
    }
  }

  const redisUrl = process.env.REDIS_URL?.trim();
  if (redisUrl && !redisUrl.startsWith('redis://') && !redisUrl.startsWith('rediss://')) {
    errors.push('REDIS_URL must start with "redis://" or "rediss://".');
  }

  const judge0ApiUrl = process.env.JUDGE0_API_URL?.trim() || 'http://localhost:2358';
  if (!isValidHttpUrl(judge0ApiUrl)) {
    errors.push('JUDGE0_API_URL must be a valid http:// or https:// URL.');
  }

  if (process.env.POLL_INTERVAL_MS !== undefined && process.env.POLL_INTERVAL_MS.trim() !== '') {
    const val = Number(process.env.POLL_INTERVAL_MS);
    if (!Number.isInteger(val) || val < 10) {
      errors.push('POLL_INTERVAL_MS must be an integer >= 10.');
    }
  }

  if (process.env.MAX_POLL_ATTEMPTS !== undefined && process.env.MAX_POLL_ATTEMPTS.trim() !== '') {
    const val = Number(process.env.MAX_POLL_ATTEMPTS);
    if (!Number.isInteger(val) || val < 1) {
      errors.push('MAX_POLL_ATTEMPTS must be an integer >= 1.');
    }
  }

  if (process.env.WORKER_CONCURRENCY !== undefined && process.env.WORKER_CONCURRENCY.trim() !== '') {
    const val = Number(process.env.WORKER_CONCURRENCY);
    if (!Number.isInteger(val) || val < 1) {
      errors.push('WORKER_CONCURRENCY must be an integer >= 1.');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid Worker environment configuration:\n- ${errors.join('\n- ')}`);
  }

  return getWorkerEnvConfig();
}

export function getWorkerEnvConfig(): WorkerEnvConfig {
  const rawRedisPort = Number(process.env.REDIS_PORT);
  const redisPort =
    Number.isInteger(rawRedisPort) && rawRedisPort >= 1 && rawRedisPort <= 65535
      ? rawRedisPort
      : 6379;

  const rawPollInterval = Number(process.env.POLL_INTERVAL_MS);
  const pollIntervalMs =
    Number.isInteger(rawPollInterval) && rawPollInterval >= 10 ? rawPollInterval : 1000;

  const rawMaxAttempts = Number(process.env.MAX_POLL_ATTEMPTS);
  const maxPollAttempts =
    Number.isInteger(rawMaxAttempts) && rawMaxAttempts >= 1 ? rawMaxAttempts : 10;

  const rawConcurrency = Number(process.env.WORKER_CONCURRENCY);
  const workerConcurrency =
    Number.isInteger(rawConcurrency) && rawConcurrency >= 1 ? rawConcurrency : 5;

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    mongoUri: process.env.MONGODB_URI?.trim() || '',
    redisHost: process.env.REDIS_HOST?.trim() || '127.0.0.1',
    redisPort,
    ...(process.env.REDIS_PASSWORD ? { redisPassword: process.env.REDIS_PASSWORD } : {}),
    ...(process.env.REDIS_URL?.trim() ? { redisUrl: process.env.REDIS_URL.trim() } : {}),
    judge0ApiUrl: (process.env.JUDGE0_API_URL?.trim() || 'http://localhost:2358').replace(/\/+$/, ''),
    ...(process.env.JUDGE0_API_KEY?.trim()
      ? { judge0ApiKey: process.env.JUDGE0_API_KEY.trim() }
      : {}),
    submissionQueueName: process.env.SUBMISSION_QUEUE_NAME?.trim() || 'submission-queue',
    pollIntervalMs,
    maxPollAttempts,
    workerConcurrency,
  };
}
