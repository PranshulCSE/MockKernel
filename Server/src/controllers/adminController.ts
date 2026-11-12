import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/auth.js';
import { Contest } from '../models/Contest.js';
import { Problem } from '../models/Problem.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import {
  createAdminUser,
  listAdmins as listAdminsService,
} from '../services/authService.js';
import { HttpError } from '../utils/http.js';
import { isRecord, readString } from '../utils/request.js';

/** POST /api/admin/users (superadmin only) */
export async function createAdmin(req: Request, res: Response): Promise<void> {
  const actor = getAuthUser(req);
  const body: unknown = req.body;
  if (!isRecord(body)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Request body must be a JSON object.'
    );
  }

  const name = readString(body.name, 'name', { min: 2, max: 100 });
  const email = readString(body.email, 'email', { min: 3, max: 254 });
  const password = readString(body.password, 'password', {
    min: 8,
    max: 128,
    trim: false,
  });

  const admin = await createAdminUser({
    name,
    email,
    password,
    createdBy: actor.id,
  });
  res.status(201).json({ data: admin });
}

/** GET /api/admin/users (superadmin only) */
export async function listAdmins(_req: Request, res: Response): Promise<void> {
  const admins = await listAdminsService();
  res.status(200).json({ data: admins });
}

/** GET /api/admin/stats (admin or superadmin) */
export async function getAdminStats(
  _req: Request,
  res: Response
): Promise<void> {
  const [totalProblems, publishedProblems, liveContests, totalSubmissions, totalUsers] =
    await Promise.all([
      Problem.countDocuments({}).exec(),
      Problem.countDocuments({ isPublished: true }).exec(),
      Contest.countDocuments({ status: 'live' }).exec(),
      Submission.countDocuments({}).exec(),
      User.countDocuments({ role: 'user' }).exec(),
    ]);

  res.status(200).json({
    data: {
      totalProblems,
      publishedProblems,
      liveContests,
      totalSubmissions,
      totalUsers,
    },
  });
}
