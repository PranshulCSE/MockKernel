import mongoose from 'mongoose';

// Prevent Mongoose from silently buffering queries when disconnected so routes fail fast instead of hanging.
mongoose.set('bufferCommands', false);

const READY_STATE_LABELS: Record<number, string> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

function sanitizeMongoUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, '//***@');
}

export function getDbStatus(): { status: string; readyState: number } {
  const readyState = mongoose.connection.readyState;
  return {
    status: READY_STATE_LABELS[readyState] ?? 'unknown',
    readyState,
  };
}

export function isDbConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

/**
 * Connects to MongoDB using MONGODB_URI. Fails fast with a clear error if missing or invalid.
 */
export async function connectDB(uriOverride?: string): Promise<typeof mongoose> {
  mongoose.set('bufferCommands', false);

  const mongoUri = (uriOverride ?? process.env.MONGODB_URI ?? '').trim();
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables.');
  }

  if (!mongoUri.startsWith('mongodb://') && !mongoUri.startsWith('mongodb+srv://')) {
    throw new Error('MONGODB_URI must start with "mongodb://" or "mongodb+srv://".');
  }

  try {
    const conn = await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 20000,
    });
    console.log(`[Server] MongoDB connected (${sanitizeMongoUri(mongoUri)})`);
    return conn;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to connect to MongoDB (${sanitizeMongoUri(mongoUri)}): ${message}`);
  }
}

export async function pingDb(): Promise<boolean> {
  if (!isDbConnected() || !mongoose.connection.db) {
    return false;
  }
  try {
    await mongoose.connection.db.admin().ping();
    return true;
  } catch {
    return false;
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}
