import { Router } from 'express';
import { getMyStats } from '../controllers/userController.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/http.js';

export const userRouter = Router();

userRouter.use(authenticate);
userRouter.get(
  '/me/stats',
  rateLimit('general'),
  asyncHandler(getMyStats)
);
