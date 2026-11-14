import type { Request, Response } from 'express';
import { getDbStatus, isDbConnected, pingDb } from '../config/db.js';
import { getEnvConfig } from '../config/env.js';
import { getRedisClient, pingRedis } from '../config/redis.js';

export interface HealthControllerDeps {
  checkJudge0?: () => Promise<{ ok: boolean; status?: number; message?: string }>;
  checkDbPing?: () => Promise<boolean>;
  checkRedisPing?: () => Promise<boolean>;
}

async function defaultCheckJudge0(): Promise<{
  ok: boolean;
  status?: number;
  message?: string;
}> {
  const { judge0ApiUrl, judge0ApiKey } = getEnvConfig();

  if (process.env.USE_LOCAL_RUNNER === 'true' || judge0ApiUrl === 'local') {
    return { ok: true, status: 200, message: 'Local code execution engine active' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2000);
  timer.unref?.();

  try {
    const headers: Record<string, string> = {};
    if (judge0ApiKey) {
      headers['X-Auth-Token'] = judge0ApiKey;
    }

    const res = await fetch(`${judge0ApiUrl}/about`, {
      method: 'GET',
      headers,
      signal: controller.signal,
    });

    if (res.ok) {
      return { ok: true, status: res.status };
    }
    return {
      ok: false,
      status: res.status,
      message: `Judge0 responded with HTTP ${res.status}`,
    };
  } catch (error) {
    if (process.env.NODE_ENV === 'development' || process.env.USE_LOCAL_RUNNER === 'true') {
      return {
        ok: true,
        status: 200,
        message: 'Local execution fallback active (Judge0 bypassed)',
      };
    }
    return {
      ok: false,
      message: error instanceof Error ? error.message : 'Judge0 unreachable',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function createHealthHandlers(deps: HealthControllerDeps = {}) {
  const checkDbPing = deps.checkDbPing ?? pingDb;
  const checkRedisPing = deps.checkRedisPing ?? (() => pingRedis(getRedisClient()));
  const checkJudge0 = deps.checkJudge0 ?? defaultCheckJudge0;

  async function health(_req: Request, res: Response): Promise<void> {
    const db = getDbStatus();
    const dbOk = isDbConnected();
    const redisStatus = getRedisClient().status ?? 'unknown';

    res.status(dbOk ? 200 : 503).json({
      status: dbOk ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime() * 100) / 100,
      database: db.status,
      services: {
        mongodb: db,
        redis: { status: redisStatus },
      },
    });
  }

  async function readiness(_req: Request, res: Response): Promise<void> {
    const [mongoOk, redisOk, judge0] = await Promise.all([
      checkDbPing(),
      checkRedisPing(),
      checkJudge0(),
    ]);

    const ready = mongoOk && redisOk && judge0.ok;
    res.status(ready ? 200 : 503).json({
      status: ready ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        mongodb: { status: mongoOk ? 'ok' : 'unavailable' },
        redis: { status: redisOk ? 'ok' : 'unavailable' },
        judge0: {
          status: judge0.ok ? 'ok' : 'unavailable',
          ...(judge0.status !== undefined ? { httpStatus: judge0.status } : {}),
          ...(judge0.message ? { message: judge0.message } : {}),
        },
      },
    });
  }

  return { health, readiness };
}

const defaultHandlers = createHealthHandlers();
export const getHealth = defaultHandlers.health;
export const getReadiness = defaultHandlers.readiness;
