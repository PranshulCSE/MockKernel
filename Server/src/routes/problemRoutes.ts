import { Router } from 'express';
import {
  createProblem,
  deleteProblem,
  getAdminProblem,
  getPublicProblem,
  listAdminProblems,
  listPublicProblems,
  updateProblem,
} from '../controllers/problemController.js';
import { authenticate, requireRole } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/http.js';

export const publicProblemRouter = Router();

publicProblemRouter.get('/', rateLimit('general'), asyncHandler(listPublicProblems));
publicProblemRouter.get('/:id', rateLimit('general'), asyncHandler(getPublicProblem));

export const adminProblemRouter = Router();

adminProblemRouter.use(authenticate, requireRole('admin', 'superadmin'));
adminProblemRouter.get('/', asyncHandler(listAdminProblems));
adminProblemRouter.post('/', asyncHandler(createProblem));
adminProblemRouter.get('/:id', asyncHandler(getAdminProblem));
adminProblemRouter.patch('/:id', asyncHandler(updateProblem));
adminProblemRouter.delete('/:id', asyncHandler(deleteProblem));
