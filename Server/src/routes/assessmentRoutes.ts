import { Router } from 'express';
import {
  analyzeProctorFrame,
  autoSubmit,
  createAssessment,
  exportAssessmentReport,
  getAdminAssessments,
  getAssessmentReport,
  joinAssessment,
  recordStrike,
  startSession,
  submitAssessment,
} from '../controllers/assessmentController.js';
import {
  authenticate,
  optionalAuthenticate,
  requireRole,
} from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimiter.js';
import { asyncHandler } from '../utils/http.js';

export const publicAssessmentRouter = Router();

publicAssessmentRouter.get(
  '/join/:code',
  authenticate,
  rateLimit('general'),
  asyncHandler(joinAssessment)
);

publicAssessmentRouter.post(
  '/:id/start',
  authenticate,
  rateLimit('submit'),
  asyncHandler(startSession)
);

publicAssessmentRouter.post(
  '/:id/strike',
  authenticate,
  rateLimit('general'),
  asyncHandler(recordStrike)
);

// auto-submit is compatible with navigator.sendBeacon (handles optional auth or plain text body)
publicAssessmentRouter.post(
  '/:id/auto-submit',
  optionalAuthenticate,
  asyncHandler(autoSubmit)
);

publicAssessmentRouter.post(
  '/:id/submit',
  authenticate,
  rateLimit('submit'),
  asyncHandler(submitAssessment)
);

publicAssessmentRouter.post(
  '/:id/proctor-frame',
  authenticate,
  rateLimit('general'),
  asyncHandler(analyzeProctorFrame)
);

export const adminAssessmentRouter = Router();

adminAssessmentRouter.use(authenticate, requireRole('admin', 'superadmin'));
adminAssessmentRouter.get('/', asyncHandler(getAdminAssessments));
adminAssessmentRouter.post('/', asyncHandler(createAssessment));
adminAssessmentRouter.get('/:id/report', asyncHandler(getAssessmentReport));
adminAssessmentRouter.get('/:id/export', asyncHandler(exportAssessmentReport));
