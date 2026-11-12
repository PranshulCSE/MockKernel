import { QueueEvents } from 'bullmq';
import type { Server } from 'socket.io';
import { getEnvConfig } from '../config/env.js';
import { createRedisClient } from '../config/redis.js';
import { Submission, type ITestCaseResult } from '../models/Submission.js';
import {
  getLeaderboard,
  recordAcceptedSubmission,
} from './leaderboardService.js';
import { processPlagiarismCheck } from './plagiarism/plagiarismService.js';

function sanitizeResultsForSocket(
  mode: 'run' | 'submit',
  results?: ITestCaseResult[]
) {
  if (!results) return undefined;
  return results.map((r) => ({
    testCase: r.testCase.toString(),
    passed: r.passed,
    ...(r.verdict !== undefined ? { verdict: r.verdict } : {}),
    ...(r.runtime !== undefined ? { runtime: r.runtime } : {}),
    ...(r.memory !== undefined ? { memory: r.memory } : {}),
    ...(mode === 'run' && r.stdout !== undefined ? { stdout: r.stdout } : {}),
    ...(mode === 'run' && r.stderr !== undefined ? { stderr: r.stderr } : {}),
  }));
}

/**
 * Post-execution pipeline triggered when the Worker finishes a submission:
 * 1. If ACCEPTED in a live contest -> run plagiarism check (F6)
 * 2. If not flagged -> update Redis leaderboard via ZINCRBY (F4) & emit leaderboard:update
 * 3. Emit final verdict:update to the owning user's Socket.io room (F3)
 */
export async function handleSubmissionCompleted(
  submissionId: string,
  io: Server | null
): Promise<void> {
  let submission = await Submission.findById(submissionId).exec();
  if (!submission) {
    return;
  }

  if (
    submission.verdict === 'ACCEPTED' &&
    submission.contest &&
    submission.mode === 'submit'
  ) {
    const contestId = submission.contest.toString();
    const flagged = await processPlagiarismCheck(submissionId);

    if (flagged) {
      const refreshed = await Submission.findById(submissionId).exec();
      if (refreshed) {
        submission = refreshed;
      }
    } else {
      const scoreResult = await recordAcceptedSubmission({
        contestId,
        problemId: submission.problem.toString(),
        userId: submission.user.toString(),
        submissionId,
      });

      if (scoreResult.updated && io) {
        const board = await getLeaderboard(contestId, 1, 20);
        io.to(`contest:${contestId}`).emit('leaderboard:update', {
          contestId,
          entries: board.entries,
          pagination: board.pagination,
        });
      }
    }
  }

  if (io) {
    io.to(`user:${submission.user.toString()}`).emit('verdict:update', {
      submissionId: submission.id,
      verdict: submission.verdict,
      runtime: submission.runtime,
      memory: submission.memory,
      compileOutput: submission.compileOutput,
      testCaseResults: sanitizeResultsForSocket(
        submission.mode,
        submission.testCaseResults
      ),
    });
  }
}

/**
 * Listens to BullMQ QueueEvents to push live RUNNING / final verdict updates
 * and trigger contest plagiarism + leaderboard pipelines without requiring a Mongo Replica Set.
 */
export function startVerdictWatcher(io: Server): {
  close: () => Promise<void>;
} {
  const { submissionQueueName } = getEnvConfig();
  const connection = createRedisClient();
  const queueEvents = new QueueEvents(submissionQueueName, { connection });

  queueEvents.on('error', (err) => {
    console.error('[VerdictWatcher] QueueEvents error:', err.message);
  });

  queueEvents.on('active', async ({ jobId }) => {
    try {
      const submission = await Submission.findById(jobId)
        .select('user verdict')
        .lean()
        .exec();
      if (submission) {
        io.to(`user:${submission.user.toString()}`).emit('verdict:update', {
          submissionId: jobId,
          verdict: 'RUNNING',
        });
      }
    } catch (err) {
      console.error('[VerdictWatcher] active handler error:', err);
    }
  });

  queueEvents.on('completed', async ({ jobId }) => {
    try {
      await handleSubmissionCompleted(jobId, io);
    } catch (err) {
      console.error('[VerdictWatcher] completed handler error:', err);
    }
  });

  queueEvents.on('failed', async ({ jobId }) => {
    try {
      await handleSubmissionCompleted(jobId, io);
    } catch (err) {
      console.error('[VerdictWatcher] failed handler error:', err);
    }
  });

  return {
    close: async () => {
      await queueEvents.close();
      if (connection.status !== 'end' && connection.status !== 'wait') {
        await connection.quit();
      }
    },
  };
}
