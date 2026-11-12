import mongoose from 'mongoose';
import 'dotenv/config';

const DEFAULT_DB_NAME = 'mockkernel';

export function getMongoUri(): string {
  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error(
      'MONGODB_URI is not defined. Add it to Server/.env or the process environment.'
    );
  }

  return uri;
}

export function getMongoDbName(): string {
  return process.env.MONGODB_DB_NAME?.trim() || DEFAULT_DB_NAME;
}

/**
 * Connects to MongoDB using MONGODB_URI. Throws if missing or connection fails.
 * Collection/index auto-creation is disabled so `npm run db:init` remains the
 * single explicit place that provisions the database schema.
 */
export async function connectDB(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  const mongoUri = getMongoUri();
  const dbName = getMongoDbName();

  mongoose.set('strictQuery', true);

  await mongoose.connect(mongoUri, {
    dbName,
    serverSelectionTimeoutMS: 10_000,
    autoCreate: false,
    autoIndex: false,
  });

  console.log(
    `[Server] MongoDB connected: ${mongoose.connection.host}/${mongoose.connection.name}`
  );

  return mongoose;
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    console.log('[Server] MongoDB disconnected.');
  }
}
