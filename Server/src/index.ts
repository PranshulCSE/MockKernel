import { createServer } from 'node:http';
import { loadEnv, validateEnv } from './config/env.js';

// Load environment variables before initializing DB, Redis, or Express.
loadEnv();

// Register all Mongoose models (discriminators need evaluation order)
import './models/index.js';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { connectRedis, disconnectRedis } from './config/redis.js';
import { createSocketServer } from './config/socket.js';
import { closeSubmissionQueue } from './queues/submissionQueue.js';
import { startVerdictWatcher } from './services/verdictEmitter.js';

async function bootstrap() {
  const env = validateEnv();
  await connectDB(env.mongoUri);
  await connectRedis();

  const app = createApp();
  const httpServer = createServer(app);
  const io = createSocketServer(httpServer);
  const verdictWatcher = startVerdictWatcher(io);

  httpServer.listen(env.port, () => {
    console.log(`[Server] Running on port ${env.port}`);
  });

  let isShuttingDown = false;
  const shutdown = async (signal: string) => {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;
    console.log(`[Server] Received ${signal}. Shutting down gracefully...`);

    const forceTimer = setTimeout(() => {
      console.error('[Server] Shutdown timed out. Exiting forcefully.');
      process.exit(1);
    }, 10_000);
    forceTimer.unref();

    httpServer.close(async () => {
      try {
        await verdictWatcher.close();
        await closeSubmissionQueue();
        await io.close();
        await disconnectRedis();
        await disconnectDB();
        console.log('[Server] Graceful shutdown complete.');
        process.exit(0);
      } catch (err) {
        console.error('[Server] Shutdown error:', err);
        process.exit(1);
      }
    });

    httpServer.closeIdleConnections?.();
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    console.error('[Server] Unhandled Rejection:', reason);
  });
}

bootstrap().catch((error) => {
  console.error('[Server] Failed to start:', error instanceof Error ? error.message : error);
  process.exit(1);
});
