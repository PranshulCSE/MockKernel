import { Router } from 'express';
import {
  abandonInterviewSession,
  getInterviewSession,
  listInterviewSessions,
  startInterviewSession,
  submitInterviewAnswer,
} from '../controllers/interviewController.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/http.js';

export const interviewRouter = Router();

interviewRouter.use(authenticate);
interviewRouter.post('/', rateLimit('ai'), asyncHandler(startInterviewSession));
interviewRouter.get('/', rateLimit('general'), asyncHandler(listInterviewSessions));
interviewRouter.get('/:id', rateLimit('general'), asyncHandler(getInterviewSession));
interviewRouter.post(
  '/:id/answer',
  rateLimit('ai'),
  asyncHandler(submitInterviewAnswer)
);
interviewRouter.patch(
  '/:id/abandon',
  rateLimit('general'),
  asyncHandler(abandonInterviewSession)
);
