import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { User } from '../src/models/User.js';
import { createTestApp, mockMongooseQuery, setupTestEnv } from './helpers.js';

describe('Authentication and Role Authorization', () => {
  beforeEach(() => {
    setupTestEnv();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers a new user, hashes password with bcrypt, and never exposes passwordHash', async () => {
    const app = createTestApp();
    const userId = new Types.ObjectId();

    vi.spyOn(User, 'exists').mockReturnValue({
      exec: vi.fn().mockResolvedValue(null),
    } as never);
    const createSpy = vi.spyOn(User, 'create').mockImplementation(async (doc: unknown) => {
      const input = doc as Record<string, unknown>;
      return {
        id: userId.toString(),
        _id: userId,
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role,
      } as never;
    });

    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'Alice@Example.com',
      password: 'Password123!',
      role: 'superadmin', // Attempted escalation must be ignored
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user).toEqual({
      id: userId.toString(),
      name: 'Alice',
      email: 'alice@example.com',
      role: 'user',
    });
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(typeof res.body.data.accessToken).toBe('string');

    const storedArg = createSpy.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(storedArg.role).toBe('user');
    expect(storedArg.passwordHash).not.toBe('Password123!');
    expect(
      await bcrypt.compare('Password123!', String(storedArg.passwordHash))
    ).toBe(true);
  });

  it('rejects duplicate email registration with 409 EMAIL_TAKEN', async () => {
    const app = createTestApp();
    vi.spyOn(User, 'exists').mockReturnValue({
      exec: vi.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    } as never);

    const res = await request(app).post('/api/auth/register').send({
      name: 'Alice',
      email: 'alice@example.com',
      password: 'Password123!',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_TAKEN');
  });

  it('logs in with valid credentials and rejects wrong password', async () => {
    const app = createTestApp();
    const userId = new Types.ObjectId();
    const passwordHash = await bcrypt.hash('CorrectPass123', 10);

    vi.spyOn(User, 'findOne').mockReturnValue(
      mockMongooseQuery({
        id: userId.toString(),
        _id: userId,
        name: 'Bob',
        email: 'bob@example.com',
        role: 'user',
        passwordHash,
      }) as never
    );

    const okRes = await request(app).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'CorrectPass123',
    });
    expect(okRes.status).toBe(200);
    expect(okRes.body.data.user.passwordHash).toBeUndefined();
    expect(typeof okRes.body.data.accessToken).toBe('string');

    const badRes = await request(app).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'WrongPassword',
    });
    expect(badRes.status).toBe(401);
    expect(badRes.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects missing token, mock x-user headers, invalid token, and expired token', async () => {
    const app = createTestApp();
    const userId = new Types.ObjectId().toString();

    // Missing token
    const missing = await request(app).get('/api/auth/me');
    expect(missing.status).toBe(401);
    expect(missing.body.error.code).toBe('UNAUTHENTICATED');

    // Old dev mock headers must NEVER authenticate
    const mockHeaders = await request(app)
      .get('/api/auth/me')
      .set('x-user-id', userId)
      .set('x-user-role', 'superadmin');
    expect(mockHeaders.status).toBe(401);
    expect(mockHeaders.body.error.code).toBe('UNAUTHENTICATED');

    // Invalid token
    const invalid = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer invalid.jwt.token');
    expect(invalid.status).toBe(401);
    expect(invalid.body.error.code).toBe('INVALID_TOKEN');

    // Expired token
    const expiredToken = jwt.sign(
      { userId, role: 'user' },
      process.env.JWT_SECRET!,
      { expiresIn: -10 }
    );
    const expired = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${expiredToken}`);
    expect(expired.status).toBe(401);
    expect(expired.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('enforces user, admin, and superadmin role authorization', async () => {
    const app = createTestApp();
    const userId = new Types.ObjectId();
    const adminId = new Types.ObjectId();
    const superId = new Types.ObjectId();

    const userToken = jwt.sign(
      { userId: userId.toString(), role: 'user' },
      process.env.JWT_SECRET!
    );
    const adminToken = jwt.sign(
      { userId: adminId.toString(), role: 'admin' },
      process.env.JWT_SECRET!
    );
    const superToken = jwt.sign(
      { userId: superId.toString(), role: 'superadmin' },
      process.env.JWT_SECRET!
    );

    vi.spyOn(User, 'findById').mockImplementation(((id: string) => {
      if (id === userId.toString()) {
        return mockMongooseQuery({
          _id: userId,
          name: 'Student',
          email: 'student@example.com',
          role: 'user',
        }) as never;
      }
      if (id === adminId.toString()) {
        return mockMongooseQuery({
          _id: adminId,
          name: 'Admin',
          email: 'admin@example.com',
          role: 'admin',
        }) as never;
      }
      return mockMongooseQuery({
        _id: superId,
        name: 'SuperAdmin',
        email: 'super@example.com',
        role: 'superadmin',
      }) as never;
    }) as never);

    // Valid user on /me
    const meRes = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${userToken}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.user.role).toBe('user');

    // Regular user denied on admin route
    const userOnAdmin = await request(app)
      .get('/api/admin/stats')
      .set('Authorization', `Bearer ${userToken}`);
    expect(userOnAdmin.status).toBe(403);
    expect(userOnAdmin.body.error.code).toBe('FORBIDDEN');

    // Admin denied on superadmin route
    const adminOnSuper = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminOnSuper.status).toBe(403);
    expect(adminOnSuper.body.error.code).toBe('FORBIDDEN');

    // Superadmin allowed on superadmin route
    vi.spyOn(User, 'find').mockReturnValue(mockMongooseQuery([]) as never);
    vi.spyOn(User, 'countDocuments').mockReturnValue({
      exec: vi.fn().mockResolvedValue(0),
    } as never);

    const superOnSuper = await request(app)
      .get('/api/admin/users')
      .set('Authorization', `Bearer ${superToken}`);
    expect(superOnSuper.status).toBe(200);
  });

  it('returns 503 on Google login when GOOGLE_CLIENT_ID is unconfigured', async () => {
    const app = createTestApp();
    process.env.GOOGLE_CLIENT_ID = '';

    const res = await request(app).post('/api/auth/google').send({
      idToken: 'some-long-google-id-token',
    });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('GOOGLE_AUTH_UNCONFIGURED');
  });
});
