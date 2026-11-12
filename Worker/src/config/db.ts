import mongoose from 'mongoose';

mongoose.set('bufferCommands', false);

function sanitizeMongoUri(uri: string): string {
  return uri.replace(/\/\/([^@/]+)@/, '//***@');
}

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
    console.log(`[Worker] MongoDB connected (${sanitizeMongoUri(mongoUri)})`);
    return conn;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Worker failed to connect to MongoDB (${sanitizeMongoUri(mongoUri)}): ${message}`);
  }
}

export async function disconnectDB(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
}
