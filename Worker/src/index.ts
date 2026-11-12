import { connectDB, disconnectDB } from './config/db.js';
import { loadWorkerEnv, validateWorkerEnv } from './config/env.js';
import { disconnectRedis, verifyRedisConnection } from './config/redis.js';
import { createSubmissionWorker } from './queues/submissionWorker.js';
import { getJudge0Service } from './services/judge0.js';

loadWorkerEnv();

const SHUTDOWN_TIMEOUT_MS = 10_000;

async function bootstrap() {
  console.log('[Worker] Starting MockKernel Background Execution Worker...');

  const env = validateWorkerEnv();
  await connectDB(env.mongoUri);
  await verifyRedisConnection();

  const judge0Health = await getJudge0Service().checkHealth();
  if (!judge0Health.ok) {
    console.warn(
      `[Worker] Judge0 health check warning (${env.judge0ApiUrl}): ${judge0Health.message ?? 'unreachable'}`
    );
  } else {
    console.log(`[Worker] Judge0 reachable at ${env.judge0ApiUrl}`);
  }

  const worker = createSubmissionWorker();

  let isShuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.log(`\n[Worker] Received ${signal}. Starting graceful shutdown...`);

    const forceExitTimer = setTimeout(() => {
      console.error('[Worker] Graceful shutdown timed out. Forcing process exit.');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      await worker.close();
      await disconnectRedis();
      await disconnectDB();
      console.log('[Worker] All connections closed cleanly. Exiting.');
      process.exit(0);
    } catch (error) {
      console.error('[Worker] Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => void handleShutdown('SIGINT'));
  process.on('SIGTERM', () => void handleShutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[Worker] Unhandled Rejection:', reason);
  });
}

bootstrap().catch((error) => {
  console.error(
    '[Worker] Failed to start worker:',
    error instanceof Error ? error.message : error
  );
  process.exit(1);
});
