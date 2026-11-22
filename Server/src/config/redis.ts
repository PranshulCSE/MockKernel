import { Redis, type RedisOptions } from 'ioredis';
import { getEnvConfig } from './env.js';

interface RedisClientState {
  retriesDisabled: boolean;
  warned: boolean;
}

const clientStates = new WeakMap<Redis, RedisClientState>();

/** Creates a BullMQ-compatible ioredis client with safe retry backoff. */
export function createRedisClient(): Redis {
  const { redisHost, redisPort, redisPassword, redisUrl } = getEnvConfig();
  const state: RedisClientState = { retriesDisabled: false, warned: false };

  const sharedOptions: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 2000,
    retryStrategy(times: number): number | null {
      if (state.retriesDisabled) {
        return null;
      }
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

  clientStates.set(client, state);

  client.on('connect', () => {
    const target = redisUrl ? 'REDIS_URL' : `${redisHost}:${redisPort}`;
    console.log(`[Server] Connected to Redis at ${target}`);
  });

  client.on('error', (err: Error) => {
    if (state.warned) {
      return;
    }
    state.warned = true;
    state.retriesDisabled = true;
    console.warn(`[Server] Redis unavailable (${err.message}); using local execution fallback.`);
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

/** Whether this process is configured to use the Redis-backed queue. */
export function isRedisEnabled(): boolean {
  return getEnvConfig().redisEnabled;
}

/** True only when Redis is enabled, connected, and not marked unavailable. */
export function isRedisReady(client: Redis = getRedisClient()): boolean {
  const state = clientStates.get(client);
  return !state?.retriesDisabled && client.status === 'ready';
}

/**
 * Initiates the Redis connection at server boot without crashing the process
 * if Redis is disabled or temporarily unavailable. Queue-backed features fall
 * back to local execution when this returns false.
 */
export async function connectRedis(client: Redis = getRedisClient()): Promise<boolean> {
  const { redisEnabled } = getEnvConfig();
  if (!redisEnabled) {
    console.log('[Server] Redis queue disabled; using local execution fallback.');
    return false;
  }
  if (client.status === 'ready') {
    return true;
  }
  if (client.status === 'connecting') {
    return false;
  }

  const state = clientStates.get(client) ?? { retriesDisabled: false, warned: false };
  clientStates.set(client, state);
  if (state.retriesDisabled) {
    return false;
  }

  try {
    await client.connect();
    return true;
  } catch (err) {
    if (!state.warned) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[Server] Redis unavailable (${message}); using local execution fallback.`);
      state.warned = true;
    }
    state.retriesDisabled = true;
    client.disconnect();
    return false;
  }
}

export async function pingRedis(client: Redis = getRedisClient()): Promise<boolean> {
  if (!isRedisEnabled() || !isRedisReady(client)) {
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
  if (client.status === 'end' || client.status === 'wait') {
    return;
  }
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
}
