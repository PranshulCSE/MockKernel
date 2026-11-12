import { Types } from 'mongoose';
import { getEnvConfig } from '../../config/env.js';
import { Contest } from '../../models/Contest.js';
import { ContestParticipant } from '../../models/ContestParticipant.js';
import { Submission, type SubmissionDocument } from '../../models/Submission.js';
import { removeUserFromLeaderboard } from '../leaderboardService.js';
import { normalizeCode } from './normalizer.js';
import { computeSimilarity } from './similarity.js';

export const MIN_NORMALIZED_CODE_LENGTH = 50;

export interface PlagiarismCheckResult {
  flagged: boolean;
  similarity: number;
  matchedSubmissionId?: string;
}

/**
 * Checks a newly ACCEPTED live-contest submission against earlier ACCEPTED
 * submissions by other users for the same contest + problem.
 */
export async function checkPlagiarism(
  submission: Pick<
    SubmissionDocument,
    '_id' | 'contest' | 'problem' | 'user' | 'language' | 'sourceCode' | 'mode' | 'verdict'
  >,
  threshold = getEnvConfig().plagiarismThreshold
): Promise<PlagiarismCheckResult> {
  if (
    !submission.contest ||
    submission.mode !== 'submit' ||
    submission.verdict !== 'ACCEPTED'
  ) {
    return { flagged: false, similarity: 0 };
  }

  const contest = await Contest.findById(submission.contest)
    .select('status')
    .lean()
    .exec();

  if (!contest || contest.status !== 'live') {
    return { flagged: false, similarity: 0 };
  }

  const normalizedTarget = normalizeCode(
    submission.sourceCode,
    submission.language
  );
  if (normalizedTarget.length < MIN_NORMALIZED_CODE_LENGTH) {
    return { flagged: false, similarity: 0 };
  }

  // Note: for very large contests (>1000 accepted submissions/problem),
  // pre-stored token hashes / winnowing fingerprints should replace linear scan.
  const candidates = await Submission.find({
    contest: submission.contest,
    problem: submission.problem,
    mode: 'submit',
    verdict: 'ACCEPTED',
    user: { $ne: submission.user },
    _id: { $ne: submission._id },
  })
    .select('_id language sourceCode')
    .lean()
    .exec();

  let highestSimilarity = 0;
  let matchedSubmissionId: string | undefined;

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeCode(
      candidate.sourceCode,
      candidate.language
    );
    if (normalizedCandidate.length < MIN_NORMALIZED_CODE_LENGTH) {
      continue;
    }

    const score = computeSimilarity(normalizedTarget, normalizedCandidate);
    if (score > highestSimilarity) {
      highestSimilarity = score;
      matchedSubmissionId = candidate._id.toString();
    }
  }

  const roundedSimilarity = Math.round(highestSimilarity * 1000) / 1000;
  const flagged = roundedSimilarity >= threshold;

  return {
    flagged,
    similarity: roundedSimilarity,
    ...(flagged && matchedSubmissionId ? { matchedSubmissionId } : {}),
  };
}

/**
 * Runs plagiarism detection for an ACCEPTED submission and persists flag state.
 * Fails open on unexpected errors so execution verdicts are never lost.
 * Returns `true` if flagged (caller must skip leaderboard update).
 */
export async function processPlagiarismCheck(
  submissionId: string,
  options: { disqualifyOnFlag?: boolean } = {}
): Promise<boolean> {
  try {
    const submission = await Submission.findById(submissionId).exec();
    if (!submission) {
      return false;
    }

    const result = await checkPlagiarism(submission);

    submission.plagiarism = {
      flagged: result.flagged,
      similarity: result.similarity,
      ...(result.matchedSubmissionId
        ? { matchedSubmission: new Types.ObjectId(result.matchedSubmissionId) }
        : {}),
    };

    if (result.flagged) {
      submission.verdict = 'PLAGIARISM_FLAGGED';
      await submission.save();

      if (options.disqualifyOnFlag && submission.contest) {
        await ContestParticipant.findOneAndUpdate(
          { contest: submission.contest, user: submission.user },
          { $set: { isDisqualified: true } }
        ).exec();
        await removeUserFromLeaderboard(
          submission.contest.toString(),
          submission.user.toString()
        );
      }

      return true;
    }

    await submission.save();
    return false;
  } catch (error) {
    console.error(
      `[Plagiarism] Check failed for submission ${submissionId} (fail-open):`,
      error
    );
    return false;
  }
}
