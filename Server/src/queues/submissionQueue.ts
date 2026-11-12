import { Queue } from 'bullmq';
import { getEnvConfig } from '../config/env.js';
import { getRedisClient } from '../config/redis.js';
import { HttpError } from '../utils/http.js';

export interface SubmissionJobTestCase {
  testCaseId: string;
  input: string;
  expectedOutput: string;
}

export interface SubmissionJobData {
  submissionId: string;
  testCases: SubmissionJobTestCase[];
  cpuTimeLimit?: number;
  memoryLimit?: number;
}

let submissionQueue: Queue<SubmissionJobData> | null = null;

function getSubmissionQueue(): Queue<SubmissionJobData> {
  if (!submissionQueue) {
    const { submissionQueueName } = getEnvConfig();
    submissionQueue = new Queue<SubmissionJobData>(submissionQueueName, {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
      },
    });
  }
  return submissionQueue;
}

/** Enqueues a code execution job onto BullMQ for the Worker pool. */
export async function enqueueSubmission(jobData: SubmissionJobData): Promise<string> {
  const client = getRedisClient();
  if (client.status !== 'ready') {
    try {
      if (client.status === 'wait') {
        await client.connect();
      }
    } catch {
      throw new HttpError(
        503,
        'QUEUE_UNAVAILABLE',
        'Submission execution queue is temporarily unavailable.'
      );
    }
    if ((client.status as string) !== 'ready') {
      throw new HttpError(
        503,
        'QUEUE_UNAVAILABLE',
        'Submission execution queue is temporarily unavailable.'
      );
    }
  }

  try {
    const queue = getSubmissionQueue();
    const job = await queue.add('execute-submission', jobData, {
      jobId: jobData.submissionId,
    });
    return job.id ?? jobData.submissionId;
  } catch (err) {
    if (err instanceof HttpError) {
      throw err;
    }
    throw new HttpError(
      503,
      'QUEUE_UNAVAILABLE',
      'Failed to enqueue submission for execution.'
    );
  }
}

export async function closeSubmissionQueue(): Promise<void> {
  if (submissionQueue) {
    await submissionQueue.close();
    submissionQueue = null;
  }
}
