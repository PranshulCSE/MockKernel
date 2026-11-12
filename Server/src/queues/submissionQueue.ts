import { Queue } from 'bullmq';
import { getEnvConfig } from '../config/env.js';
import { redis } from '../config/redis.js';

export interface SubmissionJobTestCase {
  testCaseId: string;
  input: string;
  expectedOutput: string;
}

export interface SubmissionJobData {
  submissionId: string;
  testCases?: SubmissionJobTestCase[];
  cpuTimeLimit?: number;
  memoryLimit?: number;
}

let submissionQueue: Queue<SubmissionJobData> | null = null;

function getSubmissionQueue(): Queue<SubmissionJobData> {
  if (!submissionQueue) {
    const { submissionQueueName } = getEnvConfig();
    submissionQueue = new Queue<SubmissionJobData>(submissionQueueName, {
      connection: redis,
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
export async function enqueueSubmission(
  jobData: SubmissionJobData
): Promise<string> {
  const queue = getSubmissionQueue();
  const job = await queue.add('execute-submission', jobData, {
    jobId: jobData.submissionId,
  });
  return job.id ?? jobData.submissionId;
}

export async function closeSubmissionQueue(): Promise<void> {
  if (submissionQueue) {
    await submissionQueue.close();
    submissionQueue = null;
  }
}
