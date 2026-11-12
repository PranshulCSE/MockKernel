import { Redis, type RedisOptions } from 'ioredis';
import { getEnvConfig } from './env.js';

/** Creates a BullMQ-compatible ioredis client with safe retry backoff. */
export function createRedisClient(): Redis {
  const { redisHost, redisPort, redisPassword, redisUrl } = getEnvConfig();

  const sharedOptions: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 2000,
    retryStrategy(times: number): number {
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

let singletonRedis: Redis | null = null;

export function getRedisClient(): Redis {
  if (!singletonRedis) {
    singletonRedis = createRedisClient();
  }
  return singletonRedis;
}

export const redis: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedisClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

/**
 * Initiates the Redis connection at server boot without crashing the process
 * if Redis is temporarily unavailable (rate limiter supports fail-open).
 */
export async function connectRedis(client: Redis = getRedisClient()): Promise<boolean> {
  if (client.status === 'ready') {
    return true;
  }
  if (client.status === 'connecting') {
    return false;
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

export async function pingRedis(client: Redis = getRedisClient()): Promise<boolean> {
  if (client.status !== 'ready') {
    return false;
  }
  try {
    const reply = await Promise.race([
      client.ping(),
      new Promise<never>((_resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Redis ping timeout')), 1500);
        timer.unref?.();
      }),
    ]);
    return reply === 'PONG';
  } catch {
    return false;
  }
}

export async function disconnectRedis(client: Redis = getRedisClient()): Promise<void> {
  if (client.status !== 'end' && client.status !== 'wait') {
    await client.quit();
  }
}
