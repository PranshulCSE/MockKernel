import mongoose, { type ClientSession } from 'mongoose';

function isStandaloneTransactionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const err = error as { code?: unknown; codeName?: unknown; message?: unknown };
  if (err.code === 20 || err.codeName === 'IllegalOperation') {
    return true;
  }
  return (
    typeof err.message === 'string' &&
    err.message.includes('Transaction numbers are only allowed on a replica set member or mongos')
  );
}

/**
 * Executes a multi-document database operation inside a MongoDB ACID transaction
 * when running on a replica set / mongos, with safe standalone fallback for local dev.
 */
export async function runInTransaction<T>(
  work: (session?: ClientSession) => Promise<T>,
  onStandaloneFallback?: () => Promise<T>
): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } catch (error) {
    if (isStandaloneTransactionError(error)) {
      if (onStandaloneFallback) {
        return await onStandaloneFallback();
      }
      return await work(undefined);
    }
    throw error;
  } finally {
    await session.endSession();
  }
}
