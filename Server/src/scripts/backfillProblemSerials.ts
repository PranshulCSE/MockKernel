/**
 * Assigns stable serial numbers to every problem that does not have one yet.
 *
 * Usage (from the Server directory):
 *   npx tsx src/scripts/backfillProblemSerials.ts
 */
import { connectDB, disconnectDB } from '../config/db.js';
import { loadEnv } from '../config/env.js';
import { Counter, Problem } from '../models/index.js';

loadEnv();

const PROBLEM_SERIAL_COUNTER_ID = 'problemSerial';

async function backfill(): Promise<void> {
  await connectDB();

  try {
    const problems = await Problem.find()
      .sort({ createdAt: 1, _id: 1 })
      .select('_id serialNo title')
      .lean()
      .exec();

    const existingSerials = problems
      .map((problem) => problem.serialNo)
      .filter((serial): serial is number => typeof serial === 'number');

    let nextSerial = existingSerials.length > 0 ? Math.max(...existingSerials) : 0;
    const updates: Array<{
      updateOne: {
        filter: { _id: (typeof problems)[number]['_id'] };
        update: { $set: { serialNo: number } };
      };
    }> = [];

    for (const problem of problems) {
      if (typeof problem.serialNo === 'number') {
        continue;
      }
      nextSerial += 1;
      updates.push({
        updateOne: {
          filter: { _id: problem._id },
          update: { $set: { serialNo: nextSerial } },
        },
      });
    }

    if (updates.length > 0) {
      await Problem.bulkWrite(updates);
    }

    await Counter.updateOne(
      { _id: PROBLEM_SERIAL_COUNTER_ID },
      { $max: { seq: nextSerial } },
      { upsert: true }
    ).exec();

    const assigned = updates.length;
    const total = problems.length;
    const alreadyAssigned = total - assigned;

    console.log(
      `[backfill] problem serials: ${total} total, ${assigned} assigned, ${alreadyAssigned} already present, last serial ${nextSerial}`
    );
  } finally {
    await disconnectDB();
  }
}

backfill().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[backfill] failed: ${message}`);
  process.exit(1);
});
