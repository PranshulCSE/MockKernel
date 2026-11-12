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
import { mockAuth, requireRole } from '../middleware/mockAuth.js';
import { asyncHandler } from '../utils/http.js';

export const publicProblemRouter = Router();

publicProblemRouter.get('/', asyncHandler(listPublicProblems));
publicProblemRouter.get('/:id', asyncHandler(getPublicProblem));

export const adminProblemRouter = Router();

adminProblemRouter.use(mockAuth, requireRole('admin', 'superadmin'));
adminProblemRouter.get('/', asyncHandler(listAdminProblems));
adminProblemRouter.post('/', asyncHandler(createProblem));
adminProblemRouter.get('/:id', asyncHandler(getAdminProblem));
adminProblemRouter.patch('/:id', asyncHandler(updateProblem));
adminProblemRouter.delete('/:id', asyncHandler(deleteProblem));
