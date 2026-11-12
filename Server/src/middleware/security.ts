import cors, { type CorsOptions } from 'cors';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isDbConnected } from '../config/db.js';
import { getEnvConfig } from '../config/env.js';
import { HttpError } from '../utils/http.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Builds CORS middleware enforcing the environment-configured origin allowlist.
 * Requests without an Origin header (e.g. curl, server-to-server, tests) are allowed.
 */
export function createCorsMiddleware(originsOverride?: string[]): RequestHandler {
  const allowedOrigins = new Set(originsOverride ?? getEnvConfig().corsOrigins);

  const corsOptions: CorsOptions = {
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(
        new HttpError(
          403,
          'CORS_NOT_ALLOWED',
          `Origin "${origin}" is not allowed by CORS policy.`
        )
      );
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
    exposedHeaders: ['X-Request-Id', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'Retry-After'],
    maxAge: 86400,
  };

  return cors(corsOptions);
}

function inspectForUnsafeKeys(value: unknown, path: string, depth = 0): void {
  if (depth > 25 || value === null || typeof value !== 'object') {
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      inspectForUnsafeKeys(value[i], `${path}[${i}]`, depth + 1);
    }
    return;
  }

  for (const key of Object.keys(value)) {
    if (
      FORBIDDEN_KEYS.has(key) ||
      key.startsWith('$') ||
      key.includes('[$') ||
      key.includes('__proto__') ||
      key.includes('.')
    ) {
      throw new HttpError(
        400,
        'UNSAFE_INPUT',
        `Disallowed input key "${key}" in ${path}.`
      );
    }
    inspectForUnsafeKeys(
      (value as Record<string, unknown>)[key],
      `${path}.${key}`,
      depth + 1
    );
  }
}

/**
 * Rejects MongoDB operator injection (`$...`), dotted keys, and prototype-pollution keys
 * in request bodies and query objects without mutating read-only Express 5 getters.
 */
export function sanitizeInput(req: Request, _res: Response, next: NextFunction): void {
  try {
    if (req.body !== undefined) {
      inspectForUnsafeKeys(req.body, 'body');
    }
    if (req.query !== undefined) {
      inspectForUnsafeKeys(req.query, 'query');
    }
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Prevents API requests from hanging or failing late if MongoDB is disconnected.
 */
export function requireDatabaseConnection(
  checkDb: () => boolean = isDbConnected
): RequestHandler {
  return (_req, _res, next) => {
    if (!checkDb()) {
      next(
        new HttpError(
          503,
          'DATABASE_UNAVAILABLE',
          'Database connection is not ready. Please try again shortly.'
        )
      );
      return;
    }
    next();
  };
}
