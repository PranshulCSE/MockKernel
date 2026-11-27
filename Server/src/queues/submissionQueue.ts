import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { Queue } from 'bullmq';
import { getEnvConfig } from '../config/env.js';
import { getRedisClient, isRedisReady } from '../config/redis.js';
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

function resolveWorkerDirectory(): string {
  if (process.env.WORKER_DIR) {
    const configured = resolve(process.env.WORKER_DIR);
    if (!existsSync(resolve(configured, 'package.json'))) {
      throw new Error(`Worker package not found at ${configured}`);
    }
    return configured;
  }

  const candidates = [
    resolve(process.cwd(), '..', 'Worker'),
    resolve(process.cwd(), 'Worker'),
  ];
  const found = candidates.find((dir) => existsSync(resolve(dir, 'package.json')));
  if (!found) {
    throw new Error('Worker package not found; set WORKER_DIR to its location.');
  }
  return found;
}

/**
 * Runs a submission through the Worker package directly when Redis is not
 * available. The Worker uses Judge0 when JUDGE0_API_URL is configured,
 * otherwise it falls back to its local runner. The Worker writes the verdict
 * to MongoDB; the server's verdict watcher emits the result to the client.
 */
function startLocalSubmission(jobData: SubmissionJobData): void {
  const workerDir = resolveWorkerDirectory();
  const compiledScript = resolve(workerDir, 'dist', 'scripts', 'processSubmission.js');
  const tsxCli = resolve(workerDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const sourceScript = resolve(workerDir, 'src', 'scripts', 'processSubmission.ts');

  let command: string;
  let args: string[];
  let useShell = false;

  if (existsSync(compiledScript)) {
    command = process.execPath;
    args = [compiledScript, jobData.submissionId];
  } else if (existsSync(tsxCli) && existsSync(sourceScript)) {
    command = process.execPath;
    args = [tsxCli, sourceScript, jobData.submissionId];
  } else {
    command = 'npm';
    args = ['run', 'process-submission', '--', jobData.submissionId];
    useShell = process.platform === 'win32';
  }

  const judge0ApiUrl = process.env.JUDGE0_API_URL?.trim();
  const useLocalRunner = !judge0ApiUrl || judge0ApiUrl === 'local';
  const childEnv = { ...process.env };
  if (useLocalRunner) {
    childEnv.USE_LOCAL_RUNNER = 'true';
  } else {
    delete childEnv.USE_LOCAL_RUNNER;
  }

  const child = spawn(command, args, {
    cwd: workerDir,
    env: childEnv,
    stdio: 'ignore',
    shell: useShell,
  });

  child.once('error', (err) => {
    console.error('[Server] Local submission runner failed to start:', err.message);
  });
  child.once('exit', (code) => {
    if (code !== null && code !== 0) {
      console.warn(
        `[Server] Local submission runner exited with code ${code} for ${jobData.submissionId}.`
      );
    }
  });
}

/** Enqueues a code execution job, or falls back to direct local execution. */
export async function enqueueSubmission(jobData: SubmissionJobData): Promise<string> {
  if (!isRedisReady()) {
    try {
      startLocalSubmission(jobData);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new HttpError(
        503,
        'QUEUE_UNAVAILABLE',
        `Submission execution queue is unavailable: ${message}`
      );
    }
    return `local-${jobData.submissionId}`;
  }

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
