import { Redis } from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redisPassword = process.env.REDIS_PASSWORD || undefined;

/**
 * BullMQ requires `maxRetriesPerRequest: null`.
 * Failing to set this will cause BullMQ initialization to throw an error.
 */
export const redisConnection = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

redisConnection.on('connect', () => {
  console.log(`[Worker] Connected to Redis at ${redisHost}:${redisPort}`);
});

redisConnection.on('error', (err) => {
  console.error('[Worker] Redis connection error:', err);
});
