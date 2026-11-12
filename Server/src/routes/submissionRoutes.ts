import { Router } from 'express';
import {
  createSubmission,
  getSubmission,
  listSubmissions,
} from '../controllers/submissionController.js';
import { authenticate } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/http.js';

export const submissionRouter = Router();

submissionRouter.use(authenticate);
submissionRouter.post('/', rateLimit('submit'), asyncHandler(createSubmission));
submissionRouter.get('/', rateLimit('general'), asyncHandler(listSubmissions));
submissionRouter.get('/:id', rateLimit('general'), asyncHandler(getSubmission));
