import type { Request, Response } from 'express';
import { getAuthUser } from '../middleware/auth.js';
import {
  googleLogin as googleLoginService,
  loginUser,
  registerUser,
} from '../services/authService.js';
import { HttpError } from '../utils/http.js';
import { isRecord, readString } from '../utils/request.js';

/** POST /api/auth/register */
export async function register(req: Request, res: Response): Promise<void> {
  const body = req.body as unknown;
  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const name = readString(body.name, 'name', { min: 2, max: 100 });
  const email = readString(body.email, 'email', { min: 3, max: 254 });
  const password = readString(body.password, 'password', {
    min: 8,
    max: 128,
    trim: false,
  });

  const payload = await registerUser({ name, email, password });
  res.status(201).json({ data: payload });
}

/** POST /api/auth/login */
export async function login(req: Request, res: Response): Promise<void> {
  const body = req.body as unknown;
  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const email = readString(body.email, 'email', { min: 3, max: 254 });
  const password = readString(body.password, 'password', {
    min: 1,
    max: 128,
    trim: false,
  });

  const payload = await loginUser({ email, password });
  res.status(200).json({ data: payload });
}

/** POST /api/auth/google */
export async function googleLogin(req: Request, res: Response): Promise<void> {
  const body = req.body as unknown;
  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const idToken = readString(body.idToken, 'idToken', { min: 10 });
  const payload = await googleLoginService(idToken);
  res.status(200).json({ data: payload });
}

/** GET /api/auth/me */
export async function getMe(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  res.status(200).json({ data: { user: authUser } });
}

/** POST /api/auth/logout */
export async function logout(_req: Request, res: Response): Promise<void> {
  res.status(200).json({ data: { loggedOut: true } });
}
