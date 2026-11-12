import { Types } from 'mongoose';
import { vi } from 'vitest';
import { createApp, type CreateAppOptions } from '../src/app.js';
import { generateToken } from '../src/services/authService.js';
import type { UserRole } from '../src/models/User.js';

export function setupTestEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/mockkernel_test';
  process.env.JWT_SECRET = 'test_jwt_secret_key_for_unit_tests_123';
  process.env.JWT_EXPIRES_IN = '1h';
  process.env.CORS_ORIGINS = 'http://localhost:5173,https://app.mockkernel.dev';
  process.env.GROQ_API_KEY = 'test-groq-key';
  process.env.GOOGLE_CLIENT_ID = 'test-google-client-id';
  process.env.JUDGE0_API_URL = 'http://localhost:2358';
  process.env.RATE_LIMIT_FAIL_OPEN = 'true';
}

export function createTestApp(options: CreateAppOptions = {}) {
  return createApp({
    checkDbReadiness: () => true,
    ...options,
  });
}

export function makeToken(
  userId = new Types.ObjectId().toString(),
  role: UserRole = 'user'
): string {
  return generateToken(userId, role);
}

/**
 * Helper to create a chainable Mongoose query stub (`select`, `sort`, `skip`, `limit`, `populate`, `lean`, `session`, `exec`).
 */
export function mockMongooseQuery<T>(result: T) {
  const query = {
    select: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
    skip: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    populate: vi.fn().mockReturnThis(),
    lean: vi.fn().mockReturnThis(),
    session: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue(result),
  };
  return query;
}
