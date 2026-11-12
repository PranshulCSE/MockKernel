import { Types } from 'mongoose';
import { redis } from '../config/redis.js';
import { Contest } from '../models/Contest.js';
import { ContestParticipant } from '../models/ContestParticipant.js';
import { Submission } from '../models/Submission.js';
import { User } from '../models/User.js';
import { HttpError } from '../utils/http.js';
import { getPagination } from '../utils/request.js';

export interface LeaderboardRedisClient {
  status?: string;
  zincrby(
    key: string,
    increment: number | string,
    member: string
  ): Promise<string>;
  zrevrange(
    key: string,
    start: number,
    stop: number,
    withScores: 'WITHSCORES'
  ): Promise<string[]>;
  zrevrank(key: string, member: string): Promise<number | null>;
  zscore(key: string, member: string): Promise<string | null>;
  zcard(key: string): Promise<number>;
  zrem(key: string, ...members: string[]): Promise<number>;
  sadd(key: string, ...members: string[]): Promise<number>;
  del(...keys: string[]): Promise<number>;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string;
  name: string;
  score: number;
}

export interface RecordAcceptedInput {
  contestId: string;
  problemId: string;
  userId: string;
  submissionId: string;
}

export type RecordAcceptedResult =
  | { updated: true; pointsAdded: number; totalScore: number }
  | {
      updated: false;
      reason:
        | 'CONTEST_NOT_FOUND'
        | 'CONTEST_NOT_LIVE'
        | 'PROBLEM_NOT_IN_CONTEST'
        | 'NOT_ELIGIBLE'
        | 'ALREADY_SOLVED';
    };

export interface LeaderboardDeps {
  redisClient?: LeaderboardRedisClient;
}

export function getLeaderboardKey(contestId: string): string {
  return `leaderboard:${contestId}`;
}

export function getScoredProblemsKey(contestId: string, userId: string): string {
  return `leaderboard:${contestId}:scored:${userId}`;
}

/** Parses Redis ZREVRANGE ... WITHSCORES flat array into typed score entries. */
export function parseZrevrangeWithScores(
  raw: string[]
): Array<{ userId: string; score: number }> {
  const result: Array<{ userId: string; score: number }> = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const userId = raw[i];
    const scoreRaw = raw[i + 1];
    if (userId === undefined || scoreRaw === undefined) {
      continue;
    }
    result.push({
      userId,
      score: Number(scoreRaw),
    });
  }
  return result;
}

function getClient(deps?: LeaderboardDeps): LeaderboardRedisClient {
  return deps?.redisClient ?? redis;
}

/** Atomically increments a user's score in the contest's Redis Sorted Set. */
export async function addScore(
  contestId: string,
  userId: string,
  points: number,
  deps?: LeaderboardDeps
): Promise<number> {
  if (!Number.isFinite(points) || points <= 0) {
    throw new Error('points must be a positive number');
  }

  const client = getClient(deps);
  const nextScore = await client.zincrby(
    getLeaderboardKey(contestId),
    points,
    userId
  );
  return Number(nextScore);
}

/**
 * Safely awards contest points for an ACCEPTED submission.
 * Enforces: live contest status, valid contest problem, eligible participant,
 * and strict deduplication across repeat Accepted submissions.
 */
export async function recordAcceptedSubmission(
  input: RecordAcceptedInput,
  deps?: LeaderboardDeps
): Promise<RecordAcceptedResult> {
  const { contestId, problemId, userId, submissionId } = input;
  const client = getClient(deps);

  const contest = await Contest.findById(contestId)
    .select('status problems')
    .lean()
    .exec();
  if (!contest) {
    return { updated: false, reason: 'CONTEST_NOT_FOUND' };
  }

  if (contest.status !== 'live') {
    return { updated: false, reason: 'CONTEST_NOT_LIVE' };
  }

  const contestProblem = contest.problems.find(
    (entry) => entry.problem.toString() === problemId
  );
  if (!contestProblem) {
    return { updated: false, reason: 'PROBLEM_NOT_IN_CONTEST' };
  }

  const participant = await ContestParticipant.findOne({
    contest: contestId,
    user: userId,
  })
    .select('isDisqualified')
    .lean()
    .exec();

  if (!participant || participant.isDisqualified) {
    return { updated: false, reason: 'NOT_ELIGIBLE' };
  }

  const alreadyAcceptedInDb = await Submission.exists({
    contest: new Types.ObjectId(contestId),
    problem: new Types.ObjectId(problemId),
    user: new Types.ObjectId(userId),
    verdict: 'ACCEPTED',
    mode: 'submit',
    _id: { $ne: new Types.ObjectId(submissionId) },
  }).exec();

  if (alreadyAcceptedInDb) {
    return { updated: false, reason: 'ALREADY_SOLVED' };
  }

  // Atomic SADD guard prevents concurrent workers from double-counting the same problem
  const claimed = await client.sadd(
    getScoredProblemsKey(contestId, userId),
    problemId
  );
  if (claimed === 0) {
    return { updated: false, reason: 'ALREADY_SOLVED' };
  }

  const totalScore = await addScore(
    contestId,
    userId,
    contestProblem.points,
    deps
  );

  return {
    updated: true,
    pointsAdded: contestProblem.points,
    totalScore,
  };
}

/** Removes a user's score and scored-problem markers from a contest leaderboard. */
export async function removeUserFromLeaderboard(
  contestId: string,
  userId: string,
  deps?: LeaderboardDeps
): Promise<void> {
  const client = getClient(deps);
  await Promise.all([
    client.zrem(getLeaderboardKey(contestId), userId),
    client.del(getScoredProblemsKey(contestId, userId)),
  ]);
}

/** Deletes all Redis leaderboard keys associated with a contest. */
export async function removeLeaderboard(
  contestId: string,
  deps?: LeaderboardDeps
): Promise<void> {
  const client = getClient(deps);
  const participants = await ContestParticipant.find({ contest: contestId })
    .select('user')
    .lean()
    .exec();

  const keys = [
    getLeaderboardKey(contestId),
    ...participants.map((p) =>
      getScoredProblemsKey(contestId, p.user.toString())
    ),
  ];

  if (keys.length > 0) {
    await client.del(...keys);
  }
}

/**
 * Rebuilds a contest's Redis leaderboard cleanly from MongoDB Accepted submissions.
 * Used for disaster recovery if Redis loses data.
 */
export async function rebuildLeaderboard(
  contestId: string,
  deps?: LeaderboardDeps
): Promise<{ entriesCount: number; submissionsProcessed: number }> {
  const client = getClient(deps);
  const contest = await Contest.findById(contestId)
    .select('problems')
    .lean()
    .exec();

  if (!contest) {
    throw new HttpError(404, 'CONTEST_NOT_FOUND', 'Contest not found.');
  }

  const problemPoints = new Map<string, number>();
  for (const entry of contest.problems) {
    problemPoints.set(entry.problem.toString(), entry.points);
  }

  const participants = await ContestParticipant.find({ contest: contestId })
    .select('user isDisqualified')
    .lean()
    .exec();

  const eligibleUsers = new Set<string>();
  const allKeys = [getLeaderboardKey(contestId)];
  for (const p of participants) {
    const uid = p.user.toString();
    allKeys.push(getScoredProblemsKey(contestId, uid));
    if (!p.isDisqualified) {
      eligibleUsers.add(uid);
    }
  }

  await client.del(...allKeys);

  const acceptedSubmissions = await Submission.find({
    contest: contestId,
    mode: 'submit',
    verdict: 'ACCEPTED',
  })
    .sort({ createdAt: 1 })
    .select('user problem')
    .lean()
    .exec();

  const awardedPairs = new Set<string>();
  const userScores = new Map<string, number>();
  const userSolvedProblems = new Map<string, Set<string>>();

  for (const sub of acceptedSubmissions) {
    const userId = sub.user.toString();
    const problemId = sub.problem.toString();

    if (!eligibleUsers.has(userId)) {
      continue;
    }

    const points = problemPoints.get(problemId);
    if (points === undefined) {
      continue;
    }

    const pairKey = `${userId}:${problemId}`;
    if (awardedPairs.has(pairKey)) {
      continue;
    }

    awardedPairs.add(pairKey);
    userScores.set(userId, (userScores.get(userId) ?? 0) + points);

    let solvedSet = userSolvedProblems.get(userId);
    if (!solvedSet) {
      solvedSet = new Set<string>();
      userSolvedProblems.set(userId, solvedSet);
    }
    solvedSet.add(problemId);
  }

  for (const [userId, totalPoints] of userScores.entries()) {
    await addScore(contestId, userId, totalPoints, deps);
    const solved = userSolvedProblems.get(userId);
    if (solved && solved.size > 0) {
      await client.sadd(getScoredProblemsKey(contestId, userId), ...solved);
    }
  }

  return {
    entriesCount: userScores.size,
    submissionsProcessed: awardedPairs.size,
  };
}

/** Fetches a 1-indexed user rank and score in a contest, or null if unranked. */
export async function getUserRank(
  contestId: string,
  userId: string,
  deps?: LeaderboardDeps
): Promise<{ rank: number; score: number } | null> {
  const client = getClient(deps);
  const key = getLeaderboardKey(contestId);

  const [rankIndex, scoreRaw] = await Promise.all([
    client.zrevrank(key, userId),
    client.zscore(key, userId),
  ]);

  if (rankIndex === null || scoreRaw === null) {
    return null;
  }

  return {
    rank: rankIndex + 1,
    score: Number(scoreRaw),
  };
}

/**
 * Returns a paginated leaderboard page with user display names.
 * Auto-rebuilds from MongoDB if Redis is empty while Accepted submissions exist.
 */
export async function getLeaderboard(
  contestId: string,
  page: number,
  limit: number,
  deps?: LeaderboardDeps
): Promise<{
  entries: LeaderboardEntry[];
  pagination: ReturnType<typeof getPagination>;
}> {
  const client = getClient(deps);
  const key = getLeaderboardKey(contestId);

  let total = await client.zcard(key);

  if (total === 0) {
    const hasAccepted = await Submission.exists({
      contest: contestId,
      mode: 'submit',
      verdict: 'ACCEPTED',
    }).exec();

    if (hasAccepted) {
      await rebuildLeaderboard(contestId, deps);
      total = await client.zcard(key);
    }
  }

  const start = (page - 1) * limit;
  const stop = start + limit - 1;
  const raw = total > 0 ? await client.zrevrange(key, start, stop, 'WITHSCORES') : [];
  const scored = parseZrevrangeWithScores(raw);

  if (scored.length === 0) {
    return {
      entries: [],
      pagination: getPagination(page, limit, total),
    };
  }

  const userIds = scored.map((entry) => new Types.ObjectId(entry.userId));
  const users = await User.find({ _id: { $in: userIds } })
    .select('name')
    .lean()
    .exec();

  const nameById = new Map<string, string>(
    users.map((u) => [u._id.toString(), u.name])
  );

  const entries: LeaderboardEntry[] = scored.map((entry, idx) => ({
    rank: start + idx + 1,
    userId: entry.userId,
    name: nameById.get(entry.userId) ?? 'Unknown',
    score: entry.score,
  }));

  return {
    entries,
    pagination: getPagination(page, limit, total),
  };
}
