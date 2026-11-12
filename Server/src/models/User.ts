import { Schema, model } from 'mongoose';
import type { HydratedDocument } from 'mongoose';

export const USER_ROLES = ['user', 'admin', 'superadmin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

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
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
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

export interface IStudent extends IUser {
  role: 'user';
}

export type StudentDocument = HydratedDocument<IStudent>;

/**
 * `role` is the discriminator key, so Mongooses requires a concrete
 * discriminator for the default `user` role as well. Without this, creating a
 * regular account fails with: Discriminator "user" not found for model "User".
 */
const studentSchema = new Schema<IStudent>({});

export const Student = User.discriminator<IStudent>(
  'Student',
  studentSchema,
  'user'
);
