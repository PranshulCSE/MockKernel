import { Schema } from 'mongoose';
import type { HydratedDocument } from 'mongoose';
import { User, type IUser } from './User.js';

export interface ISuperAdmin extends IUser {
  role: 'superadmin';
}

export type SuperAdminDocument = HydratedDocument<ISuperAdmin>;

const superAdminSchema = new Schema<ISuperAdmin>({});

export const SuperAdmin = User.discriminator<ISuperAdmin>(
  'SuperAdmin',
  superAdminSchema,
  'superadmin'
);
