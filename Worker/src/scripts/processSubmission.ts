import { connectDB, disconnectDB } from '../config/db.js';
import { loadWorkerEnv, validateWorkerEnv } from '../config/env.js';
import { Submission } from '../models/Submission.js';
import { TestCase } from '../models/TestCase.js';
import { processSubmissionJob } from '../queues/submissionWorker.js';

loadWorkerEnv();

/**
 * Direct execution entry point used by the API server when Redis/ BullMQ is
 * unavailable. It reuses the exact same processing pipeline as the worker.
 */
async function main(): Promise<void> {
  const submissionId = process.argv[2];
  if (!submissionId) {
    throw new Error('A submissionId argument is required.');
  }

  const env = validateWorkerEnv();
  await connectDB(env.mongoUri);

  try {
    const submission = await Submission.findById(submissionId)
      .select('problem mode')
      .lean()
      .exec();
    if (!submission) {
      throw new Error(`Submission ${submissionId} was not found.`);
    }

    const testCases = await TestCase.find({
      problem: submission.problem,
      ...(submission.mode === 'run' ? { isSample: true } : {}),
    })
      .sort({ order: 1 })
      .select('_id input expectedOutput')
      .lean()
      .exec();

    if (testCases.length === 0) {
      throw new Error(`No test cases are configured for submission ${submissionId}.`);
    }

    await processSubmissionJob({
      id: submissionId,
      data: {
        submissionId,
        testCases: testCases.map((testCase) => ({
          testCaseId: testCase._id.toString(),
          input: testCase.input,
          expectedOutput: testCase.expectedOutput,
        })),
      },
    });
  } finally {
    await disconnectDB();
  }
}

main().catch((error) => {
  console.error(
    '[Worker] Direct submission execution failed:',
    error instanceof Error ? error.message : error
  );
  process.exitCode = 1;
});
