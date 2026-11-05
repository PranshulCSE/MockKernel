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
    googleId: { type: String, unique: true, sparse: true },
    role: { type: String, enum: USER_ROLES, required: true },
  },
  { timestamps: true, discriminatorKey: 'role' }
);

export const User = model<IUser>('User', userSchema);
