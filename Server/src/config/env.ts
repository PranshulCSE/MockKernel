import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import dotenv from 'dotenv';

let envLoaded = false;

/**
 * Loads environment variables from local `.env` and falls back to workspace root `../.env`
 * without overriding variables already present in `process.env`.
 */
export function loadEnv(): void {
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

export interface EnvConfig {
  nodeEnv: string;
  port: number;
  mongoUri: string;
  redisHost: string;
  redisPort: number;
  redisPassword?: string;
  redisUrl?: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  googleClientId?: string;
  groqApiKey?: string;
  groqModel: string;
  geminiApiKey?: string;
  geminiModel: string;
  judge0ApiUrl: string;
  judge0ApiKey?: string;
  submissionQueueName: string;
  clientUrl: string;
  corsOrigins: string[];
  plagiarismThreshold: number;
}

function isValidHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function parseCorsOrigins(): string[] {
  const rawList = process.env.CORS_ORIGINS ?? process.env.CLIENT_URL ?? 'http://localhost:5173';
  const origins = rawList
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return origins.length > 0 ? origins : ['http://localhost:5173'];
}

/**
 * Validates mandatory startup environment variables and returns a typed config.
 * Throws descriptive errors when configuration is missing or malformed.
 */
export function validateEnv(): EnvConfig {
  loadEnv();

  const errors: string[] = [];
  const nodeEnv = process.env.NODE_ENV || 'development';

  const mongoUri = process.env.MONGODB_URI?.trim() || '';
  if (!mongoUri) {
    errors.push('MONGODB_URI is required.');
  } else if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    errors.push('MONGODB_URI must start with "mongodb://" or "mongodb+srv://".');
  }

  const jwtSecret = process.env.JWT_SECRET?.trim() || '';
  const minSecretLength = nodeEnv === 'production' ? 16 : 8;
  if (!jwtSecret) {
    errors.push('JWT_SECRET is required.');
  } else if (jwtSecret.length < minSecretLength) {
    errors.push(`JWT_SECRET must be at least ${minSecretLength} characters long.`);
  }

  if (process.env.PORT !== undefined && process.env.PORT.trim() !== '') {
    const rawPort = Number(process.env.PORT);
    if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65535) {
      errors.push('PORT must be an integer between 1 and 65535.');
    }
  }

  if (process.env.REDIS_PORT !== undefined && process.env.REDIS_PORT.trim() !== '') {
    const rawRedisPort = Number(process.env.REDIS_PORT);
    if (!Number.isInteger(rawRedisPort) || rawRedisPort < 1 || rawRedisPort > 65535) {
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

  const corsOrigins = parseCorsOrigins();
  for (const origin of corsOrigins) {
    if (!isValidHttpUrl(origin)) {
      errors.push(`Invalid CORS origin "${origin}". Expected http:// or https:// URL.`);
    }
  }

  if (process.env.PLAGIARISM_THRESHOLD !== undefined && process.env.PLAGIARISM_THRESHOLD.trim() !== '') {
    const threshold = Number(process.env.PLAGIARISM_THRESHOLD);
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 1) {
      errors.push('PLAGIARISM_THRESHOLD must be a number in (0, 1].');
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n- ${errors.join('\n- ')}`);
  }

  const config = getEnvConfig();
  if (nodeEnv !== 'test') {
    if (!config.groqApiKey) {
      console.warn('[Env] GROQ_API_KEY is not set — AI interview endpoints will return 503.');
    }
    if (!config.googleClientId) {
      console.warn('[Env] GOOGLE_CLIENT_ID is not set — Google OAuth verification will reject tokens.');
    }
  }

  return config;
}

/** Reads current process.env into a typed configuration object. */
export function getEnvConfig(): EnvConfig {
  const rawThreshold = Number(process.env.PLAGIARISM_THRESHOLD);
  const plagiarismThreshold =
    Number.isFinite(rawThreshold) && rawThreshold > 0 && rawThreshold <= 1 ? rawThreshold : 0.85;

  const rawPort = Number(process.env.PORT);
  const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535 ? rawPort : 3000;

  const rawRedisPort = Number(process.env.REDIS_PORT);
  const redisPort =
    Number.isInteger(rawRedisPort) && rawRedisPort >= 1 && rawRedisPort <= 65535
      ? rawRedisPort
      : 6379;

  const corsOrigins = parseCorsOrigins();

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    port,
    mongoUri: process.env.MONGODB_URI?.trim() || '',
    redisHost: process.env.REDIS_HOST?.trim() || '127.0.0.1',
    redisPort,
    ...(process.env.REDIS_PASSWORD ? { redisPassword: process.env.REDIS_PASSWORD } : {}),
    ...(process.env.REDIS_URL?.trim() ? { redisUrl: process.env.REDIS_URL.trim() } : {}),
    jwtSecret: process.env.JWT_SECRET?.trim() || '',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN?.trim() || '7d',
    ...(process.env.GOOGLE_CLIENT_ID?.trim()
      ? { googleClientId: process.env.GOOGLE_CLIENT_ID.trim() }
      : {}),
    ...(process.env.GROQ_API_KEY?.trim()
      ? { groqApiKey: process.env.GROQ_API_KEY.trim() }
      : {}),
    groqModel: process.env.GROQ_MODEL?.trim() || 'llama-3.3-70b-versatile',
    ...(process.env.GEMINI_API_KEY?.trim()
      ? { geminiApiKey: process.env.GEMINI_API_KEY.trim() }
      : {}),
    geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
    judge0ApiUrl: (process.env.JUDGE0_API_URL?.trim() || 'http://localhost:2358').replace(/\/+$/, ''),
    ...(process.env.JUDGE0_API_KEY?.trim()
      ? { judge0ApiKey: process.env.JUDGE0_API_KEY.trim() }
      : {}),
    submissionQueueName: process.env.SUBMISSION_QUEUE_NAME?.trim() || 'submission-queue',
    clientUrl: corsOrigins[0] ?? 'http://localhost:5173',
    corsOrigins,
    plagiarismThreshold,
  };
}
