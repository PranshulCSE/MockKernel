import { Schema } from 'mongoose';
import type { HydratedDocument, Types } from 'mongoose';
import { User, type IUser } from './User.js';

export interface IAdmin extends IUser {
  role: 'admin';
  createdBy?: Types.ObjectId;
}

export type AdminDocument = HydratedDocument<IAdmin>;

const adminSchema = new Schema<IAdmin>({
  createdBy: { type: Schema.Types.ObjectId, ref: 'SuperAdmin' },
});

export const Admin = User.discriminator<IAdmin>('Admin', adminSchema, 'admin');
