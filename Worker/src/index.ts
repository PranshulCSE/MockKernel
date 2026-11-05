import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { connectDB } from './config/db.js';
import { redisConnection } from './config/redis.js';
import { createSubmissionWorker } from './queues/submissionWorker.js';

dotenv.config();

const SHUTDOWN_TIMEOUT_MS = 10000;

async function bootstrap() {
  console.log('[Worker] Starting MockKernel Background Execution Worker...');

  // 1. Establish Database Connection
  await connectDB();

  // 2. Start BullMQ Submission Worker
  const worker = createSubmissionWorker();

  // 3. Graceful Shutdown Handlers
  let isShuttingDown = false;

  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log(`\n[Worker] Received ${signal}. Starting graceful shutdown...`);

    // Safety timeout to prevent hanging process
    const forceExitTimer = setTimeout(() => {
      console.error('[Worker] Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      console.log('[Worker] Closing BullMQ Worker (waiting for active jobs to complete)...');
      await worker.close();

      console.log('[Worker] Closing Redis connection...');
      await redisConnection.quit();

      console.log('[Worker] Closing MongoDB connection...');
      await mongoose.connection.close();

      console.log('[Worker] All connections closed cleanly. Exiting.');
      process.exit(0);
    } catch (error) {
      console.error('[Worker] Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));

  process.on('unhandledRejection', (reason) => {
    console.error('[Worker] Unhandled Rejection:', reason);
  });

  process.on('uncaughtException', (error) => {
    console.error('[Worker] Uncaught Exception:', error);
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  console.error('[Worker] Failed to start worker:', error);
  process.exit(1);
});
