import { isValidObjectId, Types } from 'mongoose';
import { HttpError } from './http.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/** Type guard for plain JSON objects. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Own-property check safe against null-prototype objects. */
export function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

/** Validates and normalizes a single string query parameter. */
export function readQueryString(value: unknown, field: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Query parameter "${field}" must be a single string value.`
    );
  }

  return value.trim();
}

/** Validates a string field with optional length bounds and trimming. */
export function readString(
  value: unknown,
  field: string,
  options: { min?: number; max?: number; trim?: boolean } = {}
): string {
  if (typeof value !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a string.`);
  }

  const normalized = options.trim === false ? value : value.trim();
  const min = options.min ?? 1;
  const max = options.max ?? Number.POSITIVE_INFINITY;

  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must be between ${min} and ${max} characters.`
    );
  }

  return normalized;
}

/** Validates an integer field with optional inclusive bounds. */
export function readInteger(
  value: unknown,
  field: string,
  min = Number.MIN_SAFE_INTEGER,
  max = Number.MAX_SAFE_INTEGER
): number {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must be an integer between ${min} and ${max}.`
    );
  }

  return value;
}

/** Parses an ISO date string (or Date) into a valid UTC Date instance. */
export function readDate(value: unknown, field: string): Date {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a valid date.`);
    }
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `${field} must be a valid ISO date string.`
    );
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} must be a valid date.`);
  }

  return parsed;
}

/** Validates a MongoDB ObjectId string and returns a Types.ObjectId. */
export function parseObjectId(value: unknown, label: string): Types.ObjectId {
  if (typeof value !== 'string' || !isValidObjectId(value)) {
    throw new HttpError(
      400,
      'INVALID_ID',
      `${label} is not a valid MongoDB ObjectId.`
    );
  }

  return new Types.ObjectId(value);
}

/** Parses `page` and `limit` query params with safe bounds. */
export function parsePaginationQuery(query: {
  page?: unknown;
  limit?: unknown;
}): { page: number; limit: number } {
  const rawPage = readQueryString(query.page, 'page');
  let page = DEFAULT_PAGE;
  if (rawPage !== undefined && rawPage !== '') {
    const parsedPage = Number(rawPage);
    if (!Number.isInteger(parsedPage) || parsedPage < 1) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'page must be a positive integer.'
      );
    }
    page = parsedPage;
  }

  const rawLimit = readQueryString(query.limit, 'limit');
  let limit = DEFAULT_LIMIT;
  if (rawLimit !== undefined && rawLimit !== '') {
    const parsedLimit = Number(rawLimit);
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > MAX_LIMIT) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `limit must be an integer between 1 and ${MAX_LIMIT}.`
      );
    }
    limit = parsedLimit;
  }

  return { page, limit };
}

/** Builds standardized pagination metadata. */
export function getPagination(page: number, limit: number, total: number) {
  return {
    page,
    limit,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / limit),
  };
}

/** Escapes RegExp metacharacters for safe literal regex filtering. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
