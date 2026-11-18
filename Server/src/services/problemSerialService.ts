import type { ClientSession } from 'mongoose';
import { Counter } from '../models/Counter.js';
import { Problem } from '../models/Problem.js';

const PROBLEM_SERIAL_COUNTER_ID = 'problemSerial';

/**
 * Keeps the serial counter at least as high as the largest serial already
 * stored on a problem. Safe to call on every server boot.
 */
export async function syncProblemSerialCounter(): Promise<number> {
  const latest = await Problem.aggregate<{ serialNo?: number }>([
    { $match: { serialNo: { $type: 'number' } } },
    { $sort: { serialNo: -1 } },
    { $limit: 1 },
    { $project: { _id: 0, serialNo: 1 } },
  ]).exec();

  const highestSerial = latest[0]?.serialNo ?? 0;

  await Counter.updateOne(
    { _id: PROBLEM_SERIAL_COUNTER_ID },
    { $max: { seq: highestSerial } },
    { upsert: true }
  ).exec();

  return highestSerial;
}

/**
 * Atomically reserves the next problem serial number. The counter document is
 * shared by all server instances so two simultaneous creates cannot collide.
 */
export async function getNextProblemSerialNo(
  session?: ClientSession
): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { _id: PROBLEM_SERIAL_COUNTER_ID },
    { $inc: { seq: 1 } },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
      ...(session ? { session } : {}),
    }
  )
    .lean()
    .exec();

  if (!counter || !Number.isInteger(counter.seq) || counter.seq < 1) {
    throw new Error('Could not allocate a problem serial number.');
  }

  return counter.seq;
}
