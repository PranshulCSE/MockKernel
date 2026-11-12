import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestWithContext extends Request {
  requestId?: string;
  authUser?: {
    id: string;
    role: string;
    email?: string;
    name?: string;
  };
}

const VALID_REQUEST_ID = /^[a-zA-Z0-9._-]{1,64}$/;

export function getRequestId(req: Request): string {
  return (req as RequestWithContext).requestId ?? 'unknown';
}

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const incomingId = req.header('x-request-id')?.trim();
  const requestId =
    incomingId && VALID_REQUEST_ID.test(incomingId) ? incomingId : randomUUID();

  (req as RequestWithContext).requestId = requestId;
  res.setHeader('X-Request-Id', requestId);

  const startedAt = process.hrtime.bigint();

  res.on('finish', () => {
    if (process.env.NODE_ENV === 'test' && process.env.LOG_TESTS !== 'true') {
      return;
    }

    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const authUser = (req as RequestWithContext).authUser;
    const statusCode = res.statusCode;
    const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

    const logEntry = {
      level,
      timestamp: new Date().toISOString(),
      requestId,
      method: req.method,
      path: req.originalUrl || req.url,
      statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      ...(authUser?.id ? { userId: authUser.id, role: authUser.role } : {}),
    };

    const serialized = JSON.stringify(logEntry);
    if (level === 'error') {
      console.error(serialized);
    } else if (level === 'warn') {
      console.warn(serialized);
    } else {
      console.log(serialized);
    }
  });

  next();
}
