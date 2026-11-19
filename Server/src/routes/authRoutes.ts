import { Router } from 'express';
import {
  getMe,
  googleLogin,
  login,
  logout,
  register,
  updateAccount,
  sendEmailVerification,
  verifyEmail,
} from '../controllers/authController.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/http.js';

export const authRouter = Router();

authRouter.post('/register', rateLimit('auth'), asyncHandler(register));
authRouter.post('/login', rateLimit('auth'), asyncHandler(login));
authRouter.post('/google', rateLimit('auth'), asyncHandler(googleLogin));
authRouter.get('/me', authenticate, asyncHandler(getMe));
authRouter.post('/logout', authenticate, asyncHandler(logout));
authRouter.patch('/me', authenticate, asyncHandler(updateAccount));
authRouter.post('/me/verify-email', authenticate, rateLimit('auth'), asyncHandler(sendEmailVerification));
authRouter.post('/me/verify-email/confirm', authenticate, rateLimit('auth'), asyncHandler(verifyEmail));
