import assert from 'node:assert/strict';
import { IncomingMessage, ServerResponse } from 'node:http';
import type { Socket } from 'node:net';
import { PassThrough } from 'node:stream';
import test, { mock } from 'node:test';
import bcrypt from 'bcrypt';
import type { Express } from 'express';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { createApp } from '../src/app.js';
import { Admin } from '../src/models/Admin.js';
import { User } from '../src/models/User.js';
import {
  generateToken,
  googleLogin,
  loginUser,
  registerUser,
} from '../src/services/authService.js';

function mockQuery<T>(result: T) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    lean() {
      return this;
    },
    async exec() {
      return result;
    },
  };
}

function invokeApp(
  app: Express,
  method: string,
  url: string,
  options: { headers?: Record<string, string>; body?: unknown } = {}
): Promise<{
  status: number;
  json: () => unknown;
}> {
  return new Promise((resolve, reject) => {
    const socket = new PassThrough() as unknown as Socket;
    Object.defineProperty(socket, 'remoteAddress', {
      value: '127.0.0.1',
      configurable: true,
    });
    const req = new IncomingMessage(socket);
    req.method = method;
    req.url = url;
    const headers: Record<string, string> = { ...(options.headers ?? {}) };

    if (options.body !== undefined) {
      const payload = Buffer.from(JSON.stringify(options.body), 'utf8');
      headers['content-type'] = 'application/json';
      headers['content-length'] = String(payload.length);
      req.headers = headers;
      req.push(payload);
      req.push(null);
    } else {
      req.headers = headers;
      req.push(null);
    }

    const res = new ServerResponse(req);
    const chunks: Buffer[] = [];
    const origWrite = res.write.bind(res);
    const origEnd = res.end.bind(res);
    let settled = false;

    const finish = () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      resolve({
        status: res.statusCode,
        json: () => (raw ? JSON.parse(raw) : null),
      });
    };

    res.write = ((chunk: unknown, ...rest: unknown[]) => {
      if (chunk !== undefined && chunk !== null) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      return (origWrite as (...args: unknown[]) => boolean)(chunk, ...rest);
    }) as typeof res.write;

    res.end = ((chunk?: unknown, ...rest: unknown[]) => {
      if (chunk !== undefined && chunk !== null && typeof chunk !== 'function') {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      }
      const r = (origEnd as (...args: unknown[]) => ServerResponse)(chunk, ...rest);
      queueMicrotask(finish);
      return r;
    }) as typeof res.end;

    res.on('error', reject);
    (app as unknown as (req: IncomingMessage, res: ServerResponse) => void)(req, res);
  });
}

test('registerUser hashes password and rejects duplicate emails with 409', async (t) => {
  t.after(() => mock.restoreAll());
  process.env.JWT_SECRET = 'test-secret';

  const id = new Types.ObjectId();
  mock.method(User, 'exists', () => mockQuery(null));
  mock.method(User, 'create', async (doc: { name: string; email: string; passwordHash: string }) => {
    assert.notEqual(doc.passwordHash, 'StrongPass123');
    assert.equal(await bcrypt.compare('StrongPass123', doc.passwordHash), true);
    return {
      id: id.toString(),
      name: doc.name,
      email: doc.email,
      role: 'user',
    };
  });

  const registered = await registerUser({
    name: 'Pranshul',
    email: 'Pranshul@Example.com',
    password: 'StrongPass123',
  });
  assert.equal(registered.user.email, 'pranshul@example.com');
  assert.ok(registered.accessToken);

  // Duplicate email
  mock.method(User, 'exists', () => mockQuery({ _id: id }));
  await assert.rejects(
    () =>
      registerUser({
        name: 'Pranshul',
        email: 'pranshul@example.com',
        password: 'StrongPass123',
      }),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 409 && err.code === 'EMAIL_TAKEN'
  );
});

test('loginUser rejects wrong password and Google-only accounts', async (t) => {
  t.after(() => mock.restoreAll());
  process.env.JWT_SECRET = 'test-secret';

  const hash = await bcrypt.hash('CorrectPass123', 4);
  mock.method(User, 'findOne', () =>
    mockQuery({
      id: new Types.ObjectId().toString(),
      name: 'Student',
      email: 's@test.com',
      role: 'user',
      passwordHash: hash,
    })
  );

  const ok = await loginUser({ email: 's@test.com', password: 'CorrectPass123' });
  assert.equal(ok.user.email, 's@test.com');

  await assert.rejects(
    () => loginUser({ email: 's@test.com', password: 'WrongPassword' }),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 401 && err.code === 'INVALID_CREDENTIALS'
  );

  // Google-only user (no passwordHash)
  mock.method(User, 'findOne', () =>
    mockQuery({
      id: new Types.ObjectId().toString(),
      name: 'Google User',
      email: 'g@test.com',
      role: 'user',
    })
  );
  await assert.rejects(
    () => loginUser({ email: 'g@test.com', password: 'AnyPassword123' }),
    (err: { statusCode?: number; code?: string }) =>
      err.statusCode === 401 && err.code === 'INVALID_CREDENTIALS'
  );
});

test('googleLogin links existing email account and issues JWT', async (t) => {
  t.after(() => mock.restoreAll());
  process.env.JWT_SECRET = 'test-secret';
  process.env.GOOGLE_CLIENT_ID = 'google-client-123';

  let saved = false;
  const userDoc = {
    id: new Types.ObjectId().toString(),
    name: 'Existing User',
    email: 'existing@test.com',
    role: 'user' as const,
    googleId: undefined as string | undefined,
    async save() {
      saved = true;
    },
  };
  mock.method(User, 'findOne', () => mockQuery(userDoc));

  const fakeOAuth = {
    async verifyIdToken() {
      return {
        getPayload: () => ({
          sub: 'google-sub-999',
          email: 'existing@test.com',
          email_verified: true,
          name: 'Existing User',
        }),
      };
    },
  };

  const result = await googleLogin('valid-google-token', fakeOAuth as never);
  assert.equal(saved, true);
  assert.equal(userDoc.googleId, 'google-sub-999');
  assert.equal(result.user.email, 'existing@test.com');
  assert.ok(result.accessToken);
});

test('JWT middleware enforces valid/expired/forged tokens and superadmin-only admin creation', async (t) => {
  t.after(() => mock.restoreAll());
  process.env.JWT_SECRET = 'test-secret';
  const app = createApp();
  const userId = new Types.ObjectId();
  const superId = new Types.ObjectId();

  // Missing token -> 401
  const noToken = await invokeApp(app, 'GET', '/api/auth/me');
  assert.equal(noToken.status, 401);

  // Forged token -> 401
  const forged = await invokeApp(app, 'GET', '/api/auth/me', {
    headers: { authorization: 'Bearer invalid.jwt.token' },
  });
  assert.equal(forged.status, 401);

  // Expired token -> 401 TOKEN_EXPIRED
  const expiredToken = jwt.sign({ userId: userId.toString(), role: 'user' }, 'test-secret', {
    expiresIn: -10,
  });
  const expiredRes = await invokeApp(app, 'GET', '/api/auth/me', {
    headers: { authorization: `Bearer ${expiredToken}` },
  });
  assert.equal(expiredRes.status, 401);
  assert.equal((expiredRes.json() as { error: { code: string } }).error.code, 'TOKEN_EXPIRED');

  // Role escalation attempt: admin tries superadmin route -> 403
  mock.method(User, 'findById', () =>
    mockQuery({ _id: userId, name: 'Admin', email: 'a@test.com', role: 'admin' })
  );
  const adminToken = generateToken(userId.toString(), 'admin');
  const escalated = await invokeApp(app, 'POST', '/api/admin/users', {
    headers: { authorization: `Bearer ${adminToken}` },
    body: { name: 'New Admin', email: 'na@test.com', password: 'Password123' },
  });
  assert.equal(escalated.status, 403);

  // Superadmin creates admin -> 201
  mock.method(User, 'findById', () =>
    mockQuery({ _id: superId, name: 'Root', email: 'root@test.com', role: 'superadmin' })
  );
  mock.method(User, 'exists', () => mockQuery(null));
  mock.method(Admin, 'create', async (doc: { name: string; email: string; createdBy: Types.ObjectId }) => ({
    id: new Types.ObjectId().toString(),
    name: doc.name,
    email: doc.email,
    createdBy: doc.createdBy,
  }));

  const superToken = generateToken(superId.toString(), 'superadmin');
  const created = await invokeApp(app, 'POST', '/api/admin/users', {
    headers: { authorization: `Bearer ${superToken}` },
    body: { name: 'New Admin', email: 'na@test.com', password: 'Password123' },
  });
  assert.equal(created.status, 201);
});
