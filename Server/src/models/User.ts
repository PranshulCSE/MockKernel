import { Schema, model } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export const USER_ROLES = ['user', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface IUser {
  name: string;
  email: string;
  passwordHash?: string;
  googleId?: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: [2, 'Name must be at least 2 characters long'],
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      match: [EMAIL_REGEX, 'Invalid email address format'],
    },
    passwordHash: { type: String, select: false },
    googleId: { type: String },
    role: { type: String, enum: USER_ROLES, required: true, default: 'user' },
  },
  { timestamps: true, discriminatorKey: 'role' }
);

// partialFilterExpression avoids E11000 on null/undefined googleId
userSchema.index(
  { googleId: 1 },
  { unique: true, partialFilterExpression: { googleId: { $type: 'string' } } }
);

export const User = model<IUser>('User', userSchema);
