import { Job, UnrecoverableError, Worker } from 'bullmq';
import { Types } from 'mongoose';
import { getWorkerEnvConfig } from '../config/env.js';
import { getRedisConnection } from '../config/redis.js';
import {
  Submission,
  type ITestCaseResult,
  type SubmissionVerdict,
} from '../models/Submission.js';
import {
  Judge0Error,
  getJudge0Service,
  type Judge0Service,
} from '../services/judge0.js';

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

const TERMINAL_NON_RETRY_VERDICTS = new Set<SubmissionVerdict>([
  'ACCEPTED',
  'WRONG_ANSWER',
  'TLE',
  'RUNTIME_ERROR',
  'COMPILE_ERROR',
  'PLAGIARISM_FLAGGED',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strictly validates every field in a BullMQ submission job payload.
 * Throws `UnrecoverableError` when malformed so invalid jobs never crash or loop retries.
 */
export function validateSubmissionJobData(data: unknown): SubmissionJobData {
  if (!isRecord(data)) {
    throw new UnrecoverableError('Malformed job payload: data must be an object.');
  }

  if (typeof data.submissionId !== 'string' || !Types.ObjectId.isValid(data.submissionId)) {
    throw new UnrecoverableError(
      `Malformed job payload: invalid submissionId "${String(data.submissionId)}".`
    );
  }

  if (!Array.isArray(data.testCases) || data.testCases.length === 0) {
    throw new UnrecoverableError(
      'Malformed job payload: testCases must be a non-empty array.'
    );
  }

  const seenTestCaseIds = new Set<string>();
  const validatedTestCases: SubmissionJobTestCase[] = [];

  for (let i = 0; i < data.testCases.length; i++) {
    const tc = data.testCases[i];
    if (!isRecord(tc)) {
      throw new UnrecoverableError(
        `Malformed job payload: testCases[${i}] must be an object.`
      );
    }

    if (typeof tc.testCaseId !== 'string' || !Types.ObjectId.isValid(tc.testCaseId)) {
      throw new UnrecoverableError(
        `Malformed job payload: invalid testCaseId at testCases[${i}].`
      );
    }

    if (seenTestCaseIds.has(tc.testCaseId)) {
      throw new UnrecoverableError(
        `Malformed job payload: duplicate testCaseId "${tc.testCaseId}".`
      );
    }
    seenTestCaseIds.add(tc.testCaseId);

    if (typeof tc.input !== 'string') {
      throw new UnrecoverableError(
        `Malformed job payload: testCases[${i}].input must be a string.`
      );
    }

    if (typeof tc.expectedOutput !== 'string') {
      throw new UnrecoverableError(
        `Malformed job payload: testCases[${i}].expectedOutput must be a string.`
      );
    }

    validatedTestCases.push({
      testCaseId: tc.testCaseId,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
    });
  }

  let cpuTimeLimit: number | undefined;
  if (data.cpuTimeLimit !== undefined) {
    if (
      typeof data.cpuTimeLimit !== 'number' ||
      !Number.isFinite(data.cpuTimeLimit) ||
      data.cpuTimeLimit <= 0 ||
      data.cpuTimeLimit > 30
    ) {
      throw new UnrecoverableError(
        'Malformed job payload: cpuTimeLimit must be a finite number in (0, 30].'
      );
    }
    cpuTimeLimit = data.cpuTimeLimit;
  }

  let memoryLimit: number | undefined;
  if (data.memoryLimit !== undefined) {
    if (
      typeof data.memoryLimit !== 'number' ||
      !Number.isFinite(data.memoryLimit) ||
      data.memoryLimit <= 0
    ) {
      throw new UnrecoverableError(
        'Malformed job payload: memoryLimit must be a positive finite number.'
      );
    }
    memoryLimit = data.memoryLimit;
  }

  return {
    submissionId: data.submissionId,
    testCases: validatedTestCases,
    ...(cpuTimeLimit !== undefined ? { cpuTimeLimit } : {}),
    ...(memoryLimit !== undefined ? { memoryLimit } : {}),
  };
}

function buildOrderedResults(
  testCases: SubmissionJobTestCase[],
  resultByTestCaseId: Map<string, ITestCaseResult>
): ITestCaseResult[] {
  const ordered: ITestCaseResult[] = [];
  for (const tc of testCases) {
    const entry = resultByTestCaseId.get(tc.testCaseId);
    if (entry) {
      ordered.push(entry);
    }
  }
  return ordered;
}

function summarizeResults(results: ITestCaseResult[]): {
  overallVerdict: SubmissionVerdict;
  maxRuntime: number;
  maxMemory: number;
} {
  let overallVerdict: SubmissionVerdict = 'ACCEPTED';
  let maxRuntime = 0;
  let maxMemory = 0;

  for (const r of results) {
    if (r.runtime !== undefined && r.runtime > maxRuntime) {
      maxRuntime = r.runtime;
    }
    if (r.memory !== undefined && r.memory > maxMemory) {
      maxMemory = r.memory;
    }
    if (r.verdict === 'COMPILE_ERROR') {
      overallVerdict = 'COMPILE_ERROR';
      break;
    }
    if (r.verdict && r.verdict !== 'ACCEPTED' && overallVerdict === 'ACCEPTED') {
      overallVerdict = r.verdict;
    }
  }

  return { overallVerdict, maxRuntime, maxMemory };
}

/**
 * Core processor for code execution jobs.
 * Idempotent across retries and persists partial results safely.
 */
export const processSubmissionJob = async (
  job: Pick<Job<SubmissionJobData>, 'id' | 'data'>,
  deps: { judge0?: Judge0Service } = {}
): Promise<void> => {
  const rawSubmissionId =
    isRecord(job.data) && typeof job.data.submissionId === 'string'
      ? job.data.submissionId
      : undefined;

  let validated: SubmissionJobData;
  try {
    validated = validateSubmissionJobData(job.data);
  } catch (err) {
    if (rawSubmissionId && Types.ObjectId.isValid(rawSubmissionId)) {
      await Submission.findByIdAndUpdate(rawSubmissionId, {
        $set: {
          verdict: 'INTERNAL_ERROR',
          compileOutput:
            err instanceof Error ? err.message : 'Malformed submission job payload.',
        },
      })
        .exec()
        .catch(() => {});
    }
    throw err;
  }

  const { submissionId, testCases, cpuTimeLimit, memoryLimit } = validated;
  const judge0 = deps.judge0 ?? getJudge0Service();

  console.log(`[Worker] Processing Job ${job.id ?? submissionId} for Submission: ${submissionId}`);

  const submission = await Submission.findById(submissionId).exec();
  if (!submission) {
    throw new UnrecoverableError(`Submission ${submissionId} not found in database.`);
  }

  // Idempotency guard: do not re-evaluate or corrupt already-finished submissions.
  if (TERMINAL_NON_RETRY_VERDICTS.has(submission.verdict)) {
    console.log(
      `[Worker] Submission ${submissionId} already finalized (${submission.verdict}); skipping duplicate job.`
    );
    return;
  }

  // Seed map with any completed non-error test cases from an earlier interrupted attempt.
  const resultByTestCaseId = new Map<string, ITestCaseResult>();
  if (Array.isArray(submission.testCaseResults)) {
    for (const existing of submission.testCaseResults) {
      if (existing.verdict && existing.verdict !== 'INTERNAL_ERROR') {
        resultByTestCaseId.set(existing.testCase.toString(), {
          testCase: existing.testCase,
          passed: existing.passed,
          verdict: existing.verdict,
          runtime: existing.runtime,
          memory: existing.memory,
          stdout: existing.stdout,
          stderr: existing.stderr,
        });
      }
    }
  }

  await Submission.findByIdAndUpdate(submissionId, {
    $set: { verdict: 'RUNNING' },
  }).exec();

  let compileOutput = submission.compileOutput;
  let lastToken = submission.judge0Token;
  let activeTestCase: SubmissionJobTestCase | undefined;

  try {
    for (const tc of testCases) {
      const prior = resultByTestCaseId.get(tc.testCaseId);
      if (prior) {
        if (prior.verdict === 'COMPILE_ERROR') {
          break;
        }
        continue;
      }

      console.log(
        `[Worker] Executing test case ${tc.testCaseId} for submission ${submissionId}...`
      );

      activeTestCase = tc;
      const execResult = await judge0.executeTestCase(
        submission.sourceCode,
        submission.language,
        tc.input,
        tc.expectedOutput,
        cpuTimeLimit,
        memoryLimit
      );

      lastToken = execResult.token;
      if (execResult.compileOutput !== undefined) {
        compileOutput = execResult.compileOutput;
      }

      resultByTestCaseId.set(tc.testCaseId, {
        testCase: new Types.ObjectId(tc.testCaseId),
        passed: execResult.passed,
        verdict: execResult.verdict,
        runtime: execResult.runtime,
        memory: execResult.memory,
        stdout: execResult.stdout,
        stderr: execResult.stderr,
      });

      const partialResults = buildOrderedResults(testCases, resultByTestCaseId);
      await Submission.findByIdAndUpdate(submissionId, {
        $set: {
          testCaseResults: partialResults,
          ...(lastToken ? { judge0Token: lastToken } : {}),
          ...(compileOutput !== undefined ? { compileOutput } : {}),
        },
      }).exec();

      activeTestCase = undefined;

      if (execResult.verdict === 'COMPILE_ERROR' || execResult.verdict === 'TLE') {
        break;
      }
    }

    const finalResults = buildOrderedResults(testCases, resultByTestCaseId);
    const { overallVerdict, maxRuntime, maxMemory } = summarizeResults(finalResults);

    await Submission.findByIdAndUpdate(submissionId, {
      $set: {
        verdict: overallVerdict,
        runtime: maxRuntime,
        memory: maxMemory,
        testCaseResults: finalResults,
        ...(lastToken ? { judge0Token: lastToken } : {}),
        ...(compileOutput !== undefined ? { compileOutput } : {}),
      },
    }).exec();

    console.log(
      `[Worker] Completed Submission ${submissionId} with Verdict: ${overallVerdict}`
    );
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : 'Worker execution failure';
    const isPollTimeout =
      error instanceof Judge0Error && error.code === 'JUDGE0_POLL_TIMEOUT';

    if (
      isPollTimeout &&
      activeTestCase &&
      !resultByTestCaseId.has(activeTestCase.testCaseId)
    ) {
      resultByTestCaseId.set(activeTestCase.testCaseId, {
        testCase: new Types.ObjectId(activeTestCase.testCaseId),
        passed: false,
        verdict: 'TLE',
        stderr: errorMessage,
      });
    }

    const partialResults = buildOrderedResults(testCases, resultByTestCaseId);
    const failureVerdict: SubmissionVerdict = isPollTimeout ? 'TLE' : 'INTERNAL_ERROR';

    console.error(`[Worker] Error executing submission ${submissionId}:`, errorMessage);

    await Submission.findByIdAndUpdate(submissionId, {
      $set: {
        verdict: failureVerdict,
        ...(partialResults.length > 0 ? { testCaseResults: partialResults } : {}),
        ...(compileOutput !== undefined
          ? { compileOutput }
          : failureVerdict === 'INTERNAL_ERROR'
            ? { compileOutput: errorMessage }
            : {}),
        ...(lastToken ? { judge0Token: lastToken } : {}),
      },
    })
      .exec()
      .catch(() => {});

    // A poll timeout is a final TLE verdict, not a transient infrastructure
    // failure. Do not let BullMQ retry and re-run the hanging submission.
    if (isPollTimeout || (error instanceof Judge0Error && !error.retryable)) {
      throw new UnrecoverableError(errorMessage);
    }
    throw error;
  }
};

/** Initializes and starts the BullMQ Worker. */
export const createSubmissionWorker = (): Worker<SubmissionJobData> => {
  const { submissionQueueName, workerConcurrency } = getWorkerEnvConfig();

  const worker = new Worker<SubmissionJobData>(
    submissionQueueName,
    async (job: Job<SubmissionJobData>) => {
      await processSubmissionJob(job);
    },
    {
      connection: getRedisConnection(),
      concurrency: workerConcurrency,
    }
  );

  worker.on('ready', () => {
    console.log(
      `[Worker] BullMQ Worker listening on queue "${submissionQueueName}" (concurrency: ${workerConcurrency})`
    );
  });

  worker.on('completed', (job: Job) => {
    console.log(`[Worker] Job ${job.id} completed successfully`);
  });

  worker.on('failed', (job: Job | undefined, err: Error) => {
    console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
  });

  worker.on('error', (err: Error) => {
    console.error('[Worker] BullMQ Worker error:', err.message);
  });

  return worker;
};
