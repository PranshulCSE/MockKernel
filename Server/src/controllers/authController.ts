import type { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import { createHash, randomInt } from 'node:crypto';
import nodemailer from 'nodemailer';
import { User } from '../models/User.js';
import { getEnvConfig } from '../config/env.js';
import { getIO } from '../config/socket.js';
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
  getIO()?.to('superadmins').emit('admin:users:update', { reason: 'google-sign-in' });
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

export async function updateAccount(req: Request, res: Response): Promise<void> {
  const auth = getAuthUser(req);
  if (!isRecord(req.body)) throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be an object.');
  const user = await User.findById(auth.id).select('+passwordHash').exec();
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
  if (typeof req.body.name === 'string') {
    const name = req.body.name.trim();
    if (name.length < 2 || name.length > 100) throw new HttpError(400, 'VALIDATION_ERROR', 'Name must be 2 to 100 characters.');
    user.name = name;
  }
  if (req.body.newPassword !== undefined) {
    if (typeof req.body.currentPassword !== 'string' || !user.passwordHash || !await bcrypt.compare(req.body.currentPassword, user.passwordHash)) {
      throw new HttpError(400, 'INVALID_PASSWORD', 'Current password is incorrect or this account uses Google sign-in.');
    }
    if (typeof req.body.newPassword !== 'string' || req.body.newPassword.length < 8 || req.body.newPassword.length > 128) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'New password must be 8 to 128 characters.');
    }
    user.passwordHash = await bcrypt.hash(req.body.newPassword, 12);
  }
  await user.save();
  res.status(200).json({ data: { user: { id: user.id, name: user.name, email: user.email, role: user.role, emailVerified: user.emailVerified } } });
}

export async function sendEmailVerification(req: Request, res: Response): Promise<void> {
  const auth = getAuthUser(req);
  const config = getEnvConfig();
  if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPass || !config.smtpFrom) {
    throw new HttpError(503, 'EMAIL_UNCONFIGURED', 'Email verification is unavailable until SMTP is configured.');
  }
  const user = await User.findById(auth.id).exec();
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
  if (user.emailVerified) { res.status(200).json({ data: { emailVerified: true } }); return; }
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  user.emailVerificationCodeHash = createHash('sha256').update(code).digest('hex');
  user.emailVerificationExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
  await user.save();
  const transporter = nodemailer.createTransport({ host: config.smtpHost, port: config.smtpPort, secure: config.smtpPort === 465, auth: { user: config.smtpUser, pass: config.smtpPass } });
  try {
    await transporter.sendMail({ from: config.smtpFrom, to: user.email, subject: 'MockKernel email verification', text: `Your MockKernel verification code is ${code}. It expires in 10 minutes.` });
  } catch {
    user.emailVerificationCodeHash = undefined;
    user.emailVerificationExpiresAt = undefined;
    await user.save();
    throw new HttpError(502, 'EMAIL_DELIVERY_FAILED', 'Could not send verification email. Check SMTP settings and retry.');
  }
  res.status(200).json({ data: { sent: true } });
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  const auth = getAuthUser(req);
  if (!isRecord(req.body) || typeof req.body.code !== 'string') throw new HttpError(400, 'VALIDATION_ERROR', 'A verification code is required.');
  const user = await User.findById(auth.id).select('+emailVerificationCodeHash +emailVerificationExpiresAt').exec();
  if (!user) throw new HttpError(404, 'NOT_FOUND', 'Account not found.');
  const suppliedHash = createHash('sha256').update(req.body.code.trim()).digest('hex');
  if (!user.emailVerificationCodeHash || user.emailVerificationCodeHash !== suppliedHash || !user.emailVerificationExpiresAt || user.emailVerificationExpiresAt.getTime() < Date.now()) {
    throw new HttpError(400, 'INVALID_CODE', 'Verification code is invalid or expired. Request a new code.');
  }
  user.emailVerified = true;
  user.emailVerificationCodeHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();
  res.status(200).json({ data: { emailVerified: true } });
}
