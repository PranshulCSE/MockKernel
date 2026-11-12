import 'dotenv/config';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
// Register all Mongoose models (discriminators need evaluation order)
import './models/index.js';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { validateEnv } from './config/env.js';
import { connectRedis, redis } from './config/redis.js';
import { createSocketServer } from './config/socket.js';
import { closeSubmissionQueue } from './queues/submissionQueue.js';
import { startVerdictWatcher } from './services/verdictEmitter.js';

async function bootstrap() {
  const env = validateEnv();
  await connectDB();
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
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[Server] Received ${signal}. Shutting down...`);

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
        if (redis.status !== 'end' && redis.status !== 'wait') {
          await redis.quit();
        }
        await mongoose.connection.close();
      } catch (err) {
        console.error('[Server] Shutdown error:', err);
      } finally {
        process.exit(0);
      }
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  console.error('[Server] Failed to start:', error);
  process.exit(1);
});
