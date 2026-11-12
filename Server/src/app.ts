import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { getEnvConfig } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
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

/** Builds the configured Express application without binding a network port. */
export function createApp(): Express {
  const app = express();
  const { clientUrl } = getEnvConfig();

  app.use(helmet());
  app.use(
    cors({
      origin: clientUrl,
      credentials: true,
    })
  );
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.get('/', (_req, res) => {
    res.send('MockKernel API is running');
  });

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
