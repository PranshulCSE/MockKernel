import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { HttpError } from '../utils/http.js';

interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NOT_FOUND',
      message: 'Route not found.',
    },
  });
}

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof HttpError) {
    const body: ErrorResponseBody = {
      error: {
        code: error.code,
        message: error.message,
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
      },
    });
    return;
  }

  console.error('Unhandled error:', error);
  res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred.',
    },
  });
}
