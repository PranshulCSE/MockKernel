import { Router } from 'express';
import {
  getMe,
  googleLogin,
  login,
  logout,
  register,
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
