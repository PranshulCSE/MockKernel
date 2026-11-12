import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { Redis } from 'ioredis';
import { getRedisClient } from '../config/redis.js';
import { HttpError } from '../utils/http.js';
import type { AuthenticatedRequest } from './auth.js';

export type RateLimitGroup = 'submit' | 'auth' | 'ai' | 'general';
export type RateLimitKeyBy = 'ip' | 'userOrIp';

export interface RateLimitPolicy {
  capacity: number;
  windowSeconds: number;
  keyBy: RateLimitKeyBy;
}

export interface RateLimitRedisClient {
  status?: string;
  eval(
    script: string,
    numKeys: number,
    ...args: Array<string | number>
  ): Promise<unknown>;
}

export const RATE_LIMIT_POLICIES: Record<RateLimitGroup, RateLimitPolicy> = {
  submit: { capacity: 10, windowSeconds: 60, keyBy: 'userOrIp' },
  auth: { capacity: 20, windowSeconds: 60, keyBy: 'ip' },
  ai: { capacity: 5, windowSeconds: 60, keyBy: 'userOrIp' },
  general: { capacity: 100, windowSeconds: 60, keyBy: 'userOrIp' },
};

/**
 * Atomic Token-Bucket Lua script.
 * KEYS[1]: bucket hash key
 * ARGV[1]: capacity
 * ARGV[2]: refillRatePerMs (capacity / (windowSeconds * 1000))
 * ARGV[3]: nowMs
 * ARGV[4]: requestedTokens
 * ARGV[5]: ttlSeconds
 * Returns: { allowed (1|0), remainingTokensFloor, retryAfterMs }
 */
export const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refill_rate_per_ms = tonumber(ARGV[2])
local now_ms = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])
local ttl_seconds = tonumber(ARGV[5])

local data = redis.call('HMGET', key, 'tokens', 'last_refill')
local tokens = tonumber(data[1])
local last_refill = tonumber(data[2])

if tokens == nil or last_refill == nil then
  tokens = capacity
  last_refill = now_ms
else
  local elapsed = math.max(0, now_ms - last_refill)
  local refilled = elapsed * refill_rate_per_ms
  tokens = math.min(capacity, tokens + refilled)
  last_refill = now_ms
end

local allowed = 0
local retry_after_ms = 0

if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
else
  local deficit = requested - tokens
  if refill_rate_per_ms > 0 then
    retry_after_ms = math.ceil(deficit / refill_rate_per_ms)
  else
    retry_after_ms = ttl_seconds * 1000
  end
end

redis.call('HSET', key, 'tokens', tostring(tokens), 'last_refill', tostring(last_refill))
redis.call('EXPIRE', key, ttl_seconds)

return { allowed, math.floor(tokens), retry_after_ms }
`.trim();

export interface TokenBucketResult {
  allowed: boolean;
  remaining: number;
  nextTokens: number;
  retryAfterMs: number;
}

/** Pure TypeScript mirror of the token-bucket transition for unit verification. */
export function computeTokenBucketStep(params: {
  currentTokens: number | null;
  lastRefillMs: number | null;
  capacity: number;
  windowSeconds: number;
  nowMs: number;
  requested?: number;
}): TokenBucketResult {
  const {
    currentTokens,
    lastRefillMs,
    capacity,
    windowSeconds,
    nowMs,
    requested = 1,
  } = params;

  const refillRatePerMs = capacity / (windowSeconds * 1000);
  let tokens: number;

  if (currentTokens === null || lastRefillMs === null) {
    tokens = capacity;
  } else {
    const elapsed = Math.max(0, nowMs - lastRefillMs);
    tokens = Math.min(capacity, currentTokens + elapsed * refillRatePerMs);
  }

  if (tokens >= requested) {
    const nextTokens = tokens - requested;
    return {
      allowed: true,
      remaining: Math.floor(nextTokens),
      nextTokens,
      retryAfterMs: 0,
    };
  }

  const deficit = requested - tokens;
  const retryAfterMs =
    refillRatePerMs > 0
      ? Math.ceil(deficit / refillRatePerMs)
      : windowSeconds * 1000;

  return {
    allowed: false,
    remaining: Math.floor(tokens),
    nextTokens: tokens,
    retryAfterMs,
  };
}

export function buildRateLimitKey(group: RateLimitGroup, identifier: string): string {
  return `ratelimit:${group}:${identifier}`;
}

export function resolveRateLimitIdentifier(
  req: Request,
  keyBy: RateLimitKeyBy
): string {
  if (keyBy === 'userOrIp') {
    const authUser = (req as AuthenticatedRequest).authUser;
    if (authUser?.id) {
      return `user:${authUser.id}`;
    }
  }

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  return `ip:${ip}`;
}

function parseEvalResult(raw: unknown): {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
} {
  if (!Array.isArray(raw) || raw.length < 3) {
    throw new Error('Unexpected Redis rate limiter Lua reply');
  }

  return {
    allowed: Number(raw[0]) === 1,
    remaining: Math.max(0, Number(raw[1]) || 0),
    retryAfterMs: Math.max(0, Number(raw[2]) || 0),
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Redis rate limiter timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    timer.unref?.();

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

export interface RateLimiterOptions {
  policy?: Partial<RateLimitPolicy>;
  redisClient?: RateLimitRedisClient;
  failOpen?: boolean;
  now?: () => number;
  commandTimeoutMs?: number;
}

/**
 * Express middleware factory enforcing an atomic Redis Token-Bucket rate limit.
 */
export function rateLimit(
  group: RateLimitGroup,
  options: RateLimiterOptions = {}
): RequestHandler {
  const basePolicy = RATE_LIMIT_POLICIES[group];
  const policy: RateLimitPolicy = {
    ...basePolicy,
    ...options.policy,
  };

  if (policy.capacity <= 0 || policy.windowSeconds <= 0) {
    throw new Error('RateLimitPolicy capacity and windowSeconds must be positive');
  }

  const refillRatePerMs = policy.capacity / (policy.windowSeconds * 1000);
  const ttlSeconds = Math.max(policy.windowSeconds * 2, 60);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const client = options.redisClient ?? getRedisClient();
    const failOpen = options.failOpen ?? process.env.RATE_LIMIT_FAIL_OPEN !== 'false';
    const now = options.now ?? Date.now;
    const commandTimeoutMs = options.commandTimeoutMs ?? 500;

    const identifier = resolveRateLimitIdentifier(req, policy.keyBy);
    const key = buildRateLimitKey(group, identifier);

    const handleRedisUnavailable = (reason: unknown) => {
      const msg = reason instanceof Error ? reason.message : String(reason);
      if (process.env.NODE_ENV !== 'test') {
        console.warn(`[RateLimiter] Redis unavailable (${group}): ${msg}`);
      }
      if (failOpen) {
        next();
        return;
      }
      next(
        new HttpError(
          503,
          'RATE_LIMITER_UNAVAILABLE',
          'Rate limiting service is temporarily unavailable.'
        )
      );
    };

    if (client.status !== undefined && client.status !== 'ready') {
      handleRedisUnavailable(`client status is "${client.status}"`);
      return;
    }

    try {
      const raw = await withTimeout(
        client.eval(
          TOKEN_BUCKET_LUA,
          1,
          key,
          policy.capacity,
          refillRatePerMs,
          now(),
          1,
          ttlSeconds
        ),
        commandTimeoutMs
      );

      const { allowed, remaining, retryAfterMs } = parseEvalResult(raw);
      res.setHeader('X-RateLimit-Limit', String(policy.capacity));
      res.setHeader('X-RateLimit-Remaining', String(remaining));

      if (!allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
        res.setHeader('Retry-After', String(retryAfterSeconds));
        next(
          new HttpError(
            429,
            'RATE_LIMITED',
            `Slow down — try again in ${retryAfterSeconds}s.`,
            { retryAfter: retryAfterSeconds }
          )
        );
        return;
      }

      next();
    } catch (error) {
      handleRedisUnavailable(error);
    }
  };
}
