import mongoose, { type Model } from 'mongoose';
import '../models/index.js';
import {
  Contest,
  InterviewSession,
  Problem,
  Submission,
  TestCase,
  User,
} from '../models/index.js';
import { connectDB, disconnectDB } from '../config/db.js';

type CoreCollection = {
  name: string;
  model: Model<any>;
};

/**
 * The six core collections used by MockKernel.
 * Admin and SuperAdmin share the `users` collection via Mongoose discriminators.
 */
const CORE_COLLECTIONS: CoreCollection[] = [
  { name: 'users', model: User },
  { name: 'problems', model: Problem },
  { name: 'testcases', model: TestCase },
  { name: 'submissions', model: Submission },
  { name: 'contests', model: Contest },
  { name: 'interviewsessions', model: InterviewSession },
];

function isNamespaceExists(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const mongoError = error as { code?: number; codeName?: string };
  return mongoError.code === 48 || mongoError.codeName === 'NamespaceExists';
}

async function ensureCollection(
  { name, model }: CoreCollection,
  exists: boolean
): Promise<void> {
  if (!exists) {
    try {
      await model.createCollection();
    } catch (error) {
      if (!isNamespaceExists(error)) {
        throw error;
      }
    }
  }

  await model.createIndexes();
  console.log(
    `[db:init] ${exists ? 'collection exists' : 'created collection'}: ${name}`
  );
  console.log(`[db:init] indexes ready: ${name}`);
}

async function main(): Promise<void> {
  await connectDB();

  const db = mongoose.connection.db;

  if (!db) {
    throw new Error('MongoDB connection is not ready.');
  }

  console.log(`[db:init] database: ${mongoose.connection.name}`);

  const existingCollections = await db.listCollections().toArray();
  const existingNames = new Set(
    existingCollections.map((collection) => collection.name)
  );

  for (const collection of CORE_COLLECTIONS) {
    await ensureCollection(collection, existingNames.has(collection.name));
  }

  const collections = await db.listCollections().toArray();
  const names = collections.map((collection) => collection.name).sort();

  console.log(`[db:init] collections: ${names.join(', ')}`);
  console.log('[db:init] complete.');

  await disconnectDB();
}

main().catch(async (error) => {
  console.error('[db:init] failed:', error);

  try {
    await disconnectDB();
  } catch {
    // Ignore disconnect errors while handling the original failure.
  }

  process.exit(1);
});
