import { Redis, type RedisOptions } from 'ioredis';
import { getWorkerEnvConfig } from './env.js';

/**
 * BullMQ requires `maxRetriesPerRequest: null`.
 */
export function createRedisConnection(): Redis {
  const { redisHost, redisPort, redisPassword, redisUrl } = getWorkerEnvConfig();

  const sharedOptions: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
    connectTimeout: 5000,
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
    console.log(`[Worker] Connected to Redis at ${target}`);
  });

  client.on('error', (err: Error) => {
    console.error('[Worker] Redis connection error:', err.message);
  });

  return client;
}

let singletonRedis: Redis | null = null;

export function getRedisConnection(): Redis {
  if (!singletonRedis) {
    singletonRedis = createRedisConnection();
  }
  return singletonRedis;
}

export const redisConnection: Redis = new Proxy({} as Redis, {
  get(_target, prop) {
    const client = getRedisConnection();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});

export async function verifyRedisConnection(
  client: Redis = getRedisConnection()
): Promise<void> {
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error(`Unexpected Redis PING response: ${pong}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Worker failed to connect to Redis: ${message}`);
  }
}

export async function disconnectRedis(
  client: Redis = getRedisConnection()
): Promise<void> {
  if (client.status !== 'end' && client.status !== 'wait') {
    await client.quit();
  }
}
