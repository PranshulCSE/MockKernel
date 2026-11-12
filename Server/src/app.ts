import express, { type Express } from 'express';
import helmet from 'helmet';
import {
  createHealthHandlers,
  type HealthControllerDeps,
} from './controllers/healthController.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestContext } from './middleware/requestContext.js';
import {
  createCorsMiddleware,
  requireDatabaseConnection,
  sanitizeInput,
} from './middleware/security.js';
import { adminRouter } from './routes/adminRoutes.js';
import { authRouter } from './routes/authRoutes.js';
import {
  adminContestRouter,
  publicContestRouter,
} from './routes/contestRoutes.js';
import { interviewRouter } from './routes/interviewRoutes.js';
import {
  adminProblemRouter,
  publicProblemRouter,
} from './routes/problemRoutes.js';
import { submissionRouter } from './routes/submissionRoutes.js';

export interface CreateAppOptions {
  corsOrigins?: string[];
  checkDbReadiness?: () => boolean;
  healthDeps?: HealthControllerDeps;
}

/** Builds the configured Express application without binding a network port. */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const healthHandlers = createHealthHandlers(options.healthDeps);

  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(helmet());
  app.use(createCorsMiddleware(options.corsOrigins));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true, limit: '5mb' }));
  app.use(sanitizeInput);

  app.get('/health', healthHandlers.health);
  app.get('/health/ready', healthHandlers.readiness);
  app.get('/ready', healthHandlers.readiness);

  app.get('/', (_req, res) => {
    res.status(200).json({ status: 'ok', service: 'MockKernel API' });
  });

  app.use('/api', requireDatabaseConnection(options.checkDbReadiness));
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/problems', publicProblemRouter);
  app.use('/api/admin/problems', adminProblemRouter);
  app.use('/api/contests', publicContestRouter);
  app.use('/api/admin/contests', adminContestRouter);
  app.use('/api/submissions', submissionRouter);
  app.use('/api/interviews', interviewRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
