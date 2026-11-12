import { Redis } from 'ioredis';

const redisHost = process.env.REDIS_HOST || '127.0.0.1';
const redisPort = Number(process.env.REDIS_PORT) || 6379;
const redisPassword = process.env.REDIS_PASSWORD || undefined;
const redisUrl = process.env.REDIS_URL;

/** Creates a BullMQ-compatible ioredis client with safe retry backoff. */
export function createRedisClient(): Redis {
  const sharedOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 2000,
    retryStrategy(times: number) {
      return Math.min(times * 200, 3000);
    },
  };

  const client = redisUrl
    ? new Redis(redisUrl, sharedOptions)
    : new Redis({
        host: redisHost,
        port: redisPort,
        ...(redisPassword ? { password: redisPassword } : {}),
        ...sharedOptions,
      });

  client.on('connect', () => {
    const target = redisUrl ? 'REDIS_URL' : `${redisHost}:${redisPort}`;
    console.log(`[Server] Connected to Redis at ${target}`);
  });

  client.on('error', (err: Error) => {
    console.error('[Server] Redis connection error:', err.message);
  });

  return client;
}

export const redis = createRedisClient();

/**
 * Initiates the Redis connection at server boot without crashing the process
 * if Redis is temporarily unavailable (rate limiter supports fail-open).
 */
export async function connectRedis(client: Redis = redis): Promise<boolean> {
  if (client.status === 'ready' || client.status === 'connecting') {
    return client.status === 'ready';
  }

  try {
    await client.connect();
    return true;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[Server] Initial Redis connection failed: ${message}`);
    return false;
  }
}
