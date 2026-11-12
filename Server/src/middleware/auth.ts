import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { isValidObjectId } from 'mongoose';
import { getEnvConfig } from '../config/env.js';
import { USER_ROLES, User, type UserRole } from '../models/User.js';
import { HttpError } from '../utils/http.js';

export interface AuthUser {
  id: string;
  role: UserRole;
  email?: string;
  name?: string;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

interface TokenPayload extends JwtPayload {
  userId?: string;
  role?: string;
}

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

/** Verifies a Bearer JWT and loads the current user record from MongoDB. */
export async function resolveUserFromToken(token: string): Promise<AuthUser> {
  const { jwtSecret } = getEnvConfig();
  if (!jwtSecret) {
    throw new HttpError(
      500,
      'AUTH_CONFIG_ERROR',
      'JWT_SECRET is not configured.'
    );
  }

  let decoded: TokenPayload;
  try {
    decoded = jwt.verify(token, jwtSecret) as TokenPayload;
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      throw new HttpError(401, 'TOKEN_EXPIRED', 'Session token has expired.');
    }
    throw new HttpError(401, 'INVALID_TOKEN', 'Invalid authentication token.');
  }

  if (
    !decoded.userId ||
    !isValidObjectId(decoded.userId) ||
    !decoded.role ||
    !isUserRole(decoded.role)
  ) {
    throw new HttpError(401, 'INVALID_TOKEN', 'Malformed authentication token.');
  }

  const user = await User.findById(decoded.userId)
    .select('name email role')
    .lean()
    .exec();

  if (!user) {
    throw new HttpError(
      401,
      'UNAUTHENTICATED',
      'Account associated with this token no longer exists.'
    );
  }

  return {
    id: user._id.toString(),
    role: user.role,
    email: user.email,
    name: user.name,
  };
}

function extractBearerToken(req: Request): string | null {
  const header = req.header('authorization');
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token.trim();
}

/** Strict JWT authentication middleware. */
export async function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      next(
        new HttpError(
          401,
          'UNAUTHENTICATED',
          'Missing or malformed Authorization Bearer token.'
        )
      );
      return;
    }

    (req as AuthenticatedRequest).authUser = await resolveUserFromToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** Optional JWT authentication: attaches authUser when Bearer token is provided. */
export async function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.header('authorization');
  if (!header) {
    next();
    return;
  }

  const token = extractBearerToken(req);
  if (!token) {
    next(
      new HttpError(
        401,
        'UNAUTHENTICATED',
        'Malformed Authorization Bearer header.'
      )
    );
    return;
  }

  try {
    (req as AuthenticatedRequest).authUser = await resolveUserFromToken(token);
    next();
  } catch (err) {
    next(err);
  }
}

/** Role-based authorization guard. Must run after `authenticate`. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    const authUser = (req as AuthenticatedRequest).authUser;

    if (!authUser) {
      next(new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
      return;
    }

    if (!roles.includes(authUser.role)) {
      next(
        new HttpError(
          403,
          'FORBIDDEN',
          'You do not have permission to perform this action.'
        )
      );
      return;
    }

    next();
  };
}

/** Returns the authenticated user or throws 401. */
export function getAuthUser(req: Request): AuthUser {
  const authUser = (req as AuthenticatedRequest).authUser;

  if (!authUser) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  return authUser;
}
