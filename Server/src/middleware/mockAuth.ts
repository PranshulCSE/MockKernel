import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isValidObjectId } from 'mongoose';
import { USER_ROLES, type UserRole } from '../models/User.js';
import { HttpError } from '../utils/http.js';

export interface AuthUser {
  id: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthUser;
}

function isUserRole(value: string): value is UserRole {
  return (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Temporary development-only auth guard.
 *
 * F1 owns the real JWT middleware. Until it lands, admin routes accept
 * `x-user-id` and `x-user-role` headers so the problems feature can be built
 * and tested independently. This middleware is disabled in production.
 */
export function mockAuth(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    next(
      new HttpError(
        501,
        'AUTH_NOT_IMPLEMENTED',
        'Admin authentication is not available yet.'
      )
    );
    return;
  }

  const userId = req.header('x-user-id');
  const role = req.header('x-user-role');

  if (!userId || !role) {
    next(
      new HttpError(
        401,
        'UNAUTHENTICATED',
        'Missing x-user-id or x-user-role header.'
      )
    );
    return;
  }

  if (!isValidObjectId(userId)) {
    next(
      new HttpError(
        401,
        'UNAUTHENTICATED',
        'x-user-id must be a valid MongoDB ObjectId.'
      )
    );
    return;
  }

  if (!isUserRole(role)) {
    next(
      new HttpError(
        401,
        'UNAUTHENTICATED',
        'x-user-role must be user, admin, or superadmin.'
      )
    );
    return;
  }

  (req as AuthenticatedRequest).authUser = { id: userId, role };
  next();
}

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

export function getAuthUser(req: Request): AuthUser {
  const authUser = (req as AuthenticatedRequest).authUser;

  if (!authUser) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication is required.');
  }

  return authUser;
}
