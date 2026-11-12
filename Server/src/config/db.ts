import mongoose from 'mongoose';

/**
 * Connects to MongoDB using MONGODB_URI. Throws if missing or connection fails.
 */
export async function connectDB(): Promise<typeof mongoose> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  const conn = await mongoose.connect(mongoUri);
  console.log('[Server] MongoDB connected successfully');
  return conn;
}
