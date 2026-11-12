import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { Types, type QueryFilter } from 'mongoose';
import { getEnvConfig } from '../config/env.js';
import { Admin } from '../models/Admin.js';
import { USER_ROLES, User, type IUser, type UserRole } from '../models/User.js';
import { HttpError } from '../utils/http.js';
import { escapeRegex, getPagination, isMongoDuplicateKeyError } from '../utils/request.js';

const BCRYPT_SALT_ROUNDS = 12;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface SanitizedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: Date;
}

export interface AuthPayload {
  user: SanitizedUser;
  accessToken: string;
}

export function generateToken(userId: string, role: UserRole): string {
  const { jwtSecret, jwtExpiresIn } = getEnvConfig();
  if (!jwtSecret) {
    throw new HttpError(500, 'AUTH_CONFIG_ERROR', 'JWT_SECRET is not configured.');
  }

  const options: SignOptions = {
    expiresIn: jwtExpiresIn as SignOptions['expiresIn'],
  };
  return jwt.sign({ userId, role }, jwtSecret, options);
}

function validateEmailAndPassword(email: string, password: string): { normalizedEmail: string } {
  const normalizedEmail = email.toLowerCase().trim();
  if (!EMAIL_REGEX.test(normalizedEmail)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Invalid email address.');
  }

  if (password.length < 8 || password.length > 128) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Password must be between 8 and 128 characters.'
    );
  }

  return { normalizedEmail };
}

function toAuthPayload(user: SanitizedUser): AuthPayload {
  return {
    user,
    accessToken: generateToken(user.id, user.role),
  };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): Promise<AuthPayload> {
  const { normalizedEmail } = validateEmailAndPassword(input.email, input.password);

  const existing = await User.exists({ email: normalizedEmail }).exec();
  if (existing) {
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  try {
    const created = await User.create({
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'user',
    });

    return toAuthPayload({
      id: created.id,
      name: created.name,
      email: created.email,
      role: created.role,
    });
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    }
    throw error;
  }
}

export async function loginUser(input: {
  email: string;
  password: string;
}): Promise<AuthPayload> {
  const normalizedEmail = input.email.toLowerCase().trim();
  const user = await User.findOne({ email: normalizedEmail })
    .select('+passwordHash')
    .exec();

  if (!user || !user.passwordHash) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  const matches = await bcrypt.compare(input.password, user.passwordHash);
  if (!matches) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  return toAuthPayload({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}

export async function googleLogin(
  idToken: string,
  oauthClient?: Pick<OAuth2Client, 'verifyIdToken'>
): Promise<AuthPayload> {
  const { googleClientId } = getEnvConfig();
  if (!googleClientId) {
    throw new HttpError(
      503,
      'GOOGLE_AUTH_UNCONFIGURED',
      'Google OAuth is not configured on the server.'
    );
  }

  const client = oauthClient ?? new OAuth2Client(googleClientId);
  let payload;
  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: googleClientId,
    });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(
      401,
      'GOOGLE_FAILED',
      'Google authentication failed or token is invalid.'
    );
  }

  if (!payload?.sub || !payload.email || !payload.email_verified) {
    throw new HttpError(
      401,
      'GOOGLE_FAILED',
      'Google account email could not be verified.'
    );
  }

  const normalizedEmail = payload.email.toLowerCase().trim();
  const googleId = payload.sub;

  let user = await User.findOne({
    $or: [{ googleId }, { email: normalizedEmail }],
  }).exec();

  if (user) {
    if (!user.googleId) {
      user.googleId = googleId;
      await user.save();
    }
  } else {
    try {
      user = await User.create({
        name: payload.name?.trim() || normalizedEmail.split('@')[0] || 'User',
        email: normalizedEmail,
        googleId,
        role: 'user',
      });
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        user = await User.findOne({
          $or: [{ googleId }, { email: normalizedEmail }],
        }).exec();
      }
      if (!user) {
        throw error;
      }
    }
  }

  return toAuthPayload({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
  });
}

export async function createAdminUser(input: {
  name: string;
  email: string;
  password: string;
  createdBy: string;
}): Promise<SanitizedUser & { createdBy?: string }> {
  const { normalizedEmail } = validateEmailAndPassword(input.email, input.password);

  const existing = await User.exists({ email: normalizedEmail }).exec();
  if (existing) {
    throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_SALT_ROUNDS);

  try {
    const admin = await Admin.create({
      name: input.name.trim(),
      email: normalizedEmail,
      passwordHash,
      createdBy: new Types.ObjectId(input.createdBy),
    });

    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      role: 'admin',
      createdAt: admin.createdAt,
      ...(admin.createdBy ? { createdBy: admin.createdBy.toString() } : {}),
    };
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
    }
    throw error;
  }
}

export async function listUsersPaginated(options: {
  page: number;
  limit: number;
  role?: string;
  search?: string;
}) {
  const filter: QueryFilter<IUser> = {};

  if (options.role) {
    if (!(USER_ROLES as readonly string[]).includes(options.role)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `role must be one of: ${USER_ROLES.join(', ')}.`
      );
    }
    filter.role = options.role as UserRole;
  }

  if (options.search) {
    const pattern = { $regex: escapeRegex(options.search), $options: 'i' };
    filter.$or = [{ name: pattern }, { email: pattern }];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ createdAt: -1 })
      .skip((options.page - 1) * options.limit)
      .limit(options.limit)
      .select('name email role createdAt updatedAt')
      .lean()
      .exec(),
    User.countDocuments(filter).exec(),
  ]);

  return {
    data: users.map((u) => ({
      id: u._id.toString(),
      name: u.name,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })),
    pagination: getPagination(options.page, options.limit, total),
  };
}
