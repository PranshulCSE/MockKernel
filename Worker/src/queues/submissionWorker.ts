import { Worker, Job } from 'bullmq';
import { Types } from 'mongoose';
import dotenv from 'dotenv';
import { redisConnection } from '../config/redis.js';
import {
  Submission,
  ITestCaseResult,
  SubmissionVerdict,
} from '../models/Submission.js';
import { judge0Service } from '../services/judge0.js';

dotenv.config();

const QUEUE_NAME = process.env.SUBMISSION_QUEUE_NAME || 'submission-queue';
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY) || 5;

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

/**
 * Core processor for code execution jobs
 */
export const processSubmissionJob = async (job: Job<SubmissionJobData>): Promise<void> => {
  const { submissionId, testCases = [], cpuTimeLimit, memoryLimit } = job.data;

  console.log(`[Worker] Processing Job ${job.id} for Submission: ${submissionId}`);

  if (!Types.ObjectId.isValid(submissionId)) {
    throw new Error(`Invalid submissionId: ${submissionId}`);
  }

  const submission = await Submission.findById(submissionId);
  if (!submission) {
    throw new Error(`Submission ${submissionId} not found in database`);
  }

  // Update status to RUNNING
  submission.verdict = 'RUNNING';
  await submission.save();

  try {
    const testCaseResults: ITestCaseResult[] = [];
    let overallVerdict: SubmissionVerdict = 'ACCEPTED';
    let maxRuntime = 0;
    let maxMemory = 0;
    let compileOutput: string | undefined;
    let lastToken: string | undefined;

    // If no test cases provided (e.g. ad-hoc run), execute once with empty input
    const executionList =
      testCases.length > 0
        ? testCases
        : [
            {
              testCaseId: new Types.ObjectId().toString(),
              input: '',
              expectedOutput: '',
            },
          ];

    for (const tc of executionList) {
      console.log(`[Worker] Executing test case ${tc.testCaseId} for submission ${submissionId}...`);

      const execResult = await judge0Service.executeTestCase(
        submission.sourceCode,
        submission.language,
        tc.input,
        tc.expectedOutput,
        cpuTimeLimit,
        memoryLimit
      );

      lastToken = execResult.token;

      if (execResult.compileOutput) {
        compileOutput = execResult.compileOutput;
      }

      if (execResult.runtime && execResult.runtime > maxRuntime) {
        maxRuntime = execResult.runtime;
      }

      if (execResult.memory && execResult.memory > maxMemory) {
        maxMemory = execResult.memory;
      }

      testCaseResults.push({
        testCase: new Types.ObjectId(tc.testCaseId),
        passed: execResult.passed,
        verdict: execResult.verdict,
        runtime: execResult.runtime,
        memory: execResult.memory,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
      });

      // Compilation error stops subsequent test case execution immediately
      if (execResult.verdict === 'COMPILE_ERROR') {
        overallVerdict = 'COMPILE_ERROR';
        break;
      }

      // If any test case fails and overallVerdict is still ACCEPTED, reflect first failure
      if (execResult.verdict !== 'ACCEPTED' && overallVerdict === 'ACCEPTED') {
        overallVerdict = execResult.verdict;
      }
    }

    // Persist final submission state to MongoDB
    submission.verdict = overallVerdict;
    submission.runtime = maxRuntime;
    submission.memory = maxMemory;
    if (compileOutput) {
      submission.compileOutput = compileOutput;
    }
    if (lastToken) {
      submission.judge0Token = lastToken;
    }
    if (testCaseResults.length > 0) {
      submission.testCaseResults = testCaseResults;
    }

    await submission.save();
    console.log(`[Worker] Completed Submission ${submissionId} with Verdict: ${overallVerdict}`);
  } catch (error: any) {
    console.error(`[Worker] Error executing submission ${submissionId}:`, error);

    submission.verdict = 'INTERNAL_ERROR';
    submission.compileOutput = error.message || 'Worker execution failure';
    await submission.save();

    throw error;
  }
};

/**
 * Initializes and starts the BullMQ Worker
 */
export const createSubmissionWorker = (): Worker<SubmissionJobData> => {
  const worker = new Worker<SubmissionJobData>(
    QUEUE_NAME,
    async (job: Job<SubmissionJobData>) => {
      await processSubmissionJob(job);
    },
    {
      connection: redisConnection,
      concurrency: CONCURRENCY,
    }
  );

  worker.on('ready', () => {
    console.log(`[Worker] BullMQ Worker listening on queue "${QUEUE_NAME}" (concurrency: ${CONCURRENCY})`);
  });

  worker.on('completed', (job: Job) => {
    console.log(`[Worker] Job ${job.id} has completed successfully`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Worker] Job ${job?.id} failed with error: ${err.message}`);
  });

  worker.on('error', (err: Error) => {
    console.error('[Worker] BullMQ Worker general error:', err);
  });

  return worker;
};
