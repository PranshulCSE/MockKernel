import { QueueEvents } from 'bullmq';
import type { Server } from 'socket.io';
import { getEnvConfig } from '../config/env.js';
import { createRedisClient, isRedisReady } from '../config/redis.js';
import { Submission, type ITestCaseResult, type SubmissionMode } from '../models/Submission.js';
import { getLeaderboard, recordAcceptedSubmission } from './leaderboardService.js';
import { processPlagiarismCheck } from './plagiarism/plagiarismService.js';

function sanitizeResultsForSocket(
  mode: SubmissionMode,
  results?: ITestCaseResult[]
) {
  if (!results) {
    return undefined;
  }

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
 * Post-execution pipeline triggered when the Worker finishes a submission.
 */
export async function handleSubmissionCompleted(
  submissionId: string,
  io?: Server | null
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
 * Redis-free verdict watcher used when the queue is disabled. It watches
 * MongoDB for newly finalized submissions and drives the same post-execution
 * pipeline as the BullMQ QueueEvents handler.
 */
function startPollingVerdictWatcher(io: Server): { close: () => Promise<void> } {
  const pollIntervalMs = 1000;
  const seen = new Set<string>();
  let initialized = false;
  let polling = false;
  let closed = false;

  async function recordExistingSubmissions(): Promise<void> {
    const finalized = await Submission.find({
      verdict: { $nin: ['PENDING', 'RUNNING'] },
    })
      .select('_id')
      .limit(500)
      .lean()
      .exec();
    for (const submission of finalized) {
      seen.add(submission._id.toString());
    }
    initialized = true;
  }

  void recordExistingSubmissions().catch((err) => {
    console.error('[VerdictWatcher] initial MongoDB scan failed:', err);
    initialized = true;
  });

  const timer = setInterval(() => {
    if (closed || !initialized || polling) {
      return;
    }
    polling = true;
    void (async () => {
      const finalized = await Submission.find({
        verdict: { $nin: ['PENDING', 'RUNNING'] },
      })
        .select('_id')
        .sort({ updatedAt: -1 })
        .limit(100)
        .lean()
        .exec();

      for (const submission of finalized) {
        const submissionId = submission._id.toString();
        if (seen.has(submissionId)) {
          continue;
        }
        seen.add(submissionId);
        try {
          await handleSubmissionCompleted(submissionId, io);
        } catch (err) {
          console.error('[VerdictWatcher] finalized submission handler failed:', err);
        }
      }
    })()
      .catch((err) => {
        console.error('[VerdictWatcher] MongoDB poll failed:', err);
      })
      .finally(() => {
        polling = false;
      });
  }, pollIntervalMs);
  timer.unref?.();

  return {
    close: async () => {
      closed = true;
      clearInterval(timer);
    },
  };
}

export interface VerdictWatcherOptions {
  useQueue?: boolean;
}

export function startVerdictWatcher(
  io: Server,
  options: VerdictWatcherOptions = {}
): { close: () => Promise<void> } {
  const useQueue = options.useQueue ?? isRedisReady();
  if (!useQueue) {
    console.log('[VerdictWatcher] Redis queue unavailable; watching MongoDB for verdicts.');
    return startPollingVerdictWatcher(io);
  }

  const { submissionQueueName } = getEnvConfig();
  const connection = createRedisClient();
  const queueEvents = new QueueEvents(submissionQueueName, { connection });

  queueEvents.on('error', (err: Error) => {
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
