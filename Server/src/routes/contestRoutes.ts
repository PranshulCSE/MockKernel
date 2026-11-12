import { Router } from 'express';
import {
  createContest,
  deleteContest,
  disqualifyParticipant,
  getAdminContest,
  getContestLeaderboard,
  getFlaggedContestSubmissions,
  getPublicContest,
  joinContest,
  leaveContest,
  listAdminContests,
  listPublicContests,
  rebuildContestLeaderboard,
  updateContest,
  updateContestStatus,
} from '../controllers/contestController.js';
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
} from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/http.js';

export const publicContestRouter = Router();

publicContestRouter.get(
  '/',
  optionalAuthenticate,
  rateLimit('general'),
  asyncHandler(listPublicContests)
);
publicContestRouter.get(
  '/:id',
  optionalAuthenticate,
  rateLimit('general'),
  asyncHandler(getPublicContest)
);
publicContestRouter.get(
  '/:id/leaderboard',
  optionalAuthenticate,
  rateLimit('general'),
  asyncHandler(getContestLeaderboard)
);
publicContestRouter.post(
  '/:id/join',
  authenticate,
  rateLimit('submit'),
  asyncHandler(joinContest)
);
publicContestRouter.post(
  '/:id/leave',
  authenticate,
  rateLimit('submit'),
  asyncHandler(leaveContest)
);

export const adminContestRouter = Router();

adminContestRouter.use(authenticate, requireRole('admin', 'superadmin'));
adminContestRouter.get('/', asyncHandler(listAdminContests));
adminContestRouter.post('/', asyncHandler(createContest));
adminContestRouter.get('/:id', asyncHandler(getAdminContest));
adminContestRouter.patch('/:id', asyncHandler(updateContest));
adminContestRouter.patch('/:id/status', asyncHandler(updateContestStatus));
adminContestRouter.delete('/:id', asyncHandler(deleteContest));
adminContestRouter.post(
  '/:id/leaderboard/rebuild',
  asyncHandler(rebuildContestLeaderboard)
);
adminContestRouter.get(
  '/:id/flagged',
  asyncHandler(getFlaggedContestSubmissions)
);
adminContestRouter.patch(
  '/:id/participants/:userId/disqualify',
  asyncHandler(disqualifyParticipant)
);
