import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { HttpError } from '../utils/http.js';
import { isMongoDuplicateKeyError } from '../utils/request.js';
import { getRequestId } from './requestContext.js';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    requestId: string;
    details?: unknown;
  };
}

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
      requestId: getRequestId(req),
    },
  });
}

function isPayloadTooLargeError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    ('type' in error && (error as { type?: unknown }).type === 'entity.too.large')
  );
}

function isMongooseDisconnectedError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const msg = error.message;
  return (
    msg.includes('Client must be connected before running operations') ||
    msg.includes('bufferCommands') ||
    error.name === 'MongoNotConnectedError' ||
    error.name === 'MongoServerSelectionError'
  );
}

export function errorHandler(
  error: unknown,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = getRequestId(req);

  if (error instanceof HttpError) {
    const body: ErrorResponseBody = {
      error: {
        code: error.code,
        message: error.message,
        requestId,
      },
    };

    if (error.details !== undefined) {
      body.error.details = error.details;
    }

    res.status(error.statusCode).json(body);
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const details = Object.fromEntries(
      Object.entries(error.errors).map(([path, validationError]) => [
        path,
        validationError.message,
      ])
    );

    res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Request validation failed.',
        requestId,
        details,
      },
    });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({
      error: {
        code: 'INVALID_ID',
        message: `Invalid value for ${error.path}.`,
        requestId,
      },
    });
    return;
  }

  if (isMongoDuplicateKeyError(error)) {
    res.status(409).json({
      error: {
        code: 'DUPLICATE_KEY',
        message: 'A resource with the same unique value already exists.',
        requestId,
      },
    });
    return;
  }

  if (isPayloadTooLargeError(error)) {
    res.status(413).json({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request payload exceeds the maximum allowed size.',
        requestId,
      },
    });
    return;
  }

  if (
    error instanceof SyntaxError &&
    'status' in error &&
    error.status === 400
  ) {
    res.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'Request body contains invalid JSON.',
        requestId,
      },
    });
    return;
  }

  if (isMongooseDisconnectedError(error)) {
    res.status(503).json({
      error: {
        code: 'DATABASE_UNAVAILABLE',
        message: 'Database service is temporarily unavailable.',
        requestId,
      },
    });
    return;
  }

  console.error(
    JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      requestId,
      message: error instanceof Error ? error.message : 'Unhandled error',
      name: error instanceof Error ? error.name : typeof error,
    })
  );

  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
      requestId,
    },
  });
}
