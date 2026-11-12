import type { Request, Response } from 'express';
import { Types, type QueryFilter } from 'mongoose';
import { getAuthUser, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  CONTEST_STATUSES,
  Contest,
  type ContestDocument,
  type ContestStatus,
  type IContest,
  type IContestProblem,
} from '../models/Contest.js';
import { ContestParticipant } from '../models/ContestParticipant.js';
import { Problem } from '../models/Problem.js';
import { Submission } from '../models/Submission.js';
import {
  getLeaderboard,
  getUserRank,
  rebuildLeaderboard,
  removeLeaderboard,
  removeUserFromLeaderboard,
} from '../services/leaderboardService.js';
import { HttpError } from '../utils/http.js';
import {
  escapeRegex,
  getPagination,
  hasOwn,
  isMongoDuplicateKeyError,
  isRecord,
  parseObjectId,
  parsePaginationQuery,
  readDate,
  readInteger,
  readQueryString,
  readString,
} from '../utils/request.js';
import { runInTransaction } from '../utils/transaction.js';
import { toSubmissionResponse } from './submissionController.js';

const TITLE_MIN_LENGTH = 3;
const TITLE_MAX_LENGTH = 150;
const DESCRIPTION_MAX_LENGTH = 20_000;

const ALLOWED_TRANSITIONS: Record<ContestStatus, ContestStatus[]> = {
  draft: ['live'],
  live: ['ended'],
  ended: [],
};

export function isValidContestTransition(
  from: ContestStatus,
  to: ContestStatus
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

function isContestStatus(value: string): value is ContestStatus {
  return (CONTEST_STATUSES as readonly string[]).includes(value);
}

async function parseContestProblems(value: unknown): Promise<IContestProblem[]> {
  if (!Array.isArray(value) || value.length === 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'problems must be a non-empty array.'
    );
  }

  const seenProblems = new Set<string>();
  const seenOrders = new Set<number>();
  const parsed: IContestProblem[] = [];

  for (let i = 0; i < value.length; i++) {
    const item = value[i];
    if (!isRecord(item)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `problems[${i}] must be an object.`
      );
    }

    const problemId = parseObjectId(item.problemId, `problems[${i}].problemId`);
    const points = readInteger(item.points, `problems[${i}].points`, 1);
    const order = readInteger(item.order, `problems[${i}].order`, 0);

    const problemKey = problemId.toString();
    if (seenProblems.has(problemKey)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Duplicate problemId "${problemKey}" in problems.`
      );
    }
    if (seenOrders.has(order)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `Duplicate order "${order}" in problems.`
      );
    }

    seenProblems.add(problemKey);
    seenOrders.add(order);
    parsed.push({ problem: problemId, points, order });
  }

  const problemIds = parsed.map((p) => p.problem);
  const existingProblems = await Problem.find({
    _id: { $in: problemIds },
    isPublished: true,
  })
    .select('_id')
    .lean()
    .exec();

  const validIds = new Set(existingProblems.map((p) => p._id.toString()));
  const invalidIds = parsed
    .map((p) => p.problem.toString())
    .filter((id) => !validIds.has(id));

  if (invalidIds.length > 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `Some problems do not exist or are not published: ${invalidIds.join(', ')}.`
    );
  }

  return parsed.sort((a, b) => a.order - b.order);
}

async function findContestOrThrow(id: unknown): Promise<ContestDocument> {
  const contestId = parseObjectId(id, 'Contest id');
  const contest = await Contest.findById(contestId).exec();
  if (!contest) {
    throw new HttpError(404, 'CONTEST_NOT_FOUND', 'Contest not found.');
  }
  return contest;
}

async function getParticipantCounts(
  contestIds: Types.ObjectId[]
): Promise<Map<string, number>> {
  if (contestIds.length === 0) {
    return new Map();
  }

  const rows = await ContestParticipant.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { contest: { $in: contestIds } } },
    { $group: { _id: '$contest', count: { $sum: 1 } } },
  ]).exec();

  return new Map(rows.map((r) => [r._id.toString(), r.count]));
}

function toContestSummary(contest: ContestDocument, participantCount: number) {
  return {
    id: contest.id,
    title: contest.title,
    description: contest.description,
    problemCount: contest.problems.length,
    startTime: contest.startTime,
    endTime: contest.endTime,
    status: contest.status,
    participantCount,
    createdAt: contest.createdAt,
    updatedAt: contest.updatedAt,
  };
}

async function toPopulatedContestDetail(
  contest: ContestDocument,
  participantCount: number
) {
  const problemIds = contest.problems.map((p) => p.problem);
  const problemDocs = await Problem.find({ _id: { $in: problemIds } })
    .select('title difficulty supportedLanguages isPublished')
    .lean()
    .exec();

  const problemMap = new Map(problemDocs.map((p) => [p._id.toString(), p]));

  return {
    id: contest.id,
    title: contest.title,
    description: contest.description,
    startTime: contest.startTime,
    endTime: contest.endTime,
    status: contest.status,
    participantCount,
    createdAt: contest.createdAt,
    updatedAt: contest.updatedAt,
    problems: [...contest.problems]
      .sort((a, b) => a.order - b.order)
      .map((entry) => {
        const doc = problemMap.get(entry.problem.toString());
        return {
          problemId: entry.problem.toString(),
          points: entry.points,
          order: entry.order,
          title: doc?.title ?? 'Unavailable Problem',
          difficulty: doc?.difficulty,
          supportedLanguages: doc?.supportedLanguages ?? [],
        };
      }),
  };
}

async function transitionContestStatus(
  contest: ContestDocument,
  nextStatus: ContestStatus
): Promise<ContestDocument> {
  if (!isValidContestTransition(contest.status, nextStatus)) {
    throw new HttpError(
      409,
      'INVALID_STATUS_TRANSITION',
      `Cannot transition contest status from "${contest.status}" to "${nextStatus}".`
    );
  }

  const now = new Date();
  if (nextStatus === 'live') {
    if (contest.endTime <= now) {
      throw new HttpError(
        409,
        'CONTEST_EXPIRED',
        'Cannot launch a contest whose endTime has already passed.'
      );
    }

    const problemIds = contest.problems.map((p) => p.problem);
    const publishedCount = await Problem.countDocuments({
      _id: { $in: problemIds },
      isPublished: true,
    }).exec();

    if (publishedCount !== problemIds.length) {
      throw new HttpError(
        409,
        'UNPUBLISHED_PROBLEMS',
        'All problems in a contest must be published before going live.'
      );
    }

    if (contest.startTime > now) {
      contest.startTime = now;
    }
  }

  contest.status = nextStatus;
  await contest.save();
  return contest;
}

/** POST /api/admin/contests */
export async function createContest(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const body = req.body as unknown;
  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  const title = readString(body.title, 'title', {
    min: TITLE_MIN_LENGTH,
    max: TITLE_MAX_LENGTH,
  });
  const description = readString(body.description, 'description', {
    max: DESCRIPTION_MAX_LENGTH,
  });
  const startTime = readDate(body.startTime, 'startTime');
  const endTime = readDate(body.endTime, 'endTime');

  if (endTime <= startTime) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'endTime must be after startTime.'
    );
  }

  const problems = await parseContestProblems(body.problems);

  const contest = await Contest.create({
    title,
    description,
    problems,
    startTime,
    endTime,
    status: 'draft',
    createdBy: new Types.ObjectId(authUser.id),
  });

  const detail = await toPopulatedContestDetail(contest, 0);
  res.status(201).json({
    data: {
      ...detail,
      createdBy: contest.createdBy.toString(),
    },
  });
}

/** GET /api/admin/contests */
export async function listAdminContests(req: Request, res: Response): Promise<void> {
  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const filter: QueryFilter<IContest> = {};

  const status = readQueryString(req.query.status, 'status');
  if (status) {
    if (!isContestStatus(status)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `status must be one of: ${CONTEST_STATUSES.join(', ')}.`
      );
    }
    filter.status = status;
  }

  const search = readQueryString(req.query.search, 'search');
  if (search) {
    filter.title = { $regex: escapeRegex(search), $options: 'i' };
  }

  const [contests, total] = await Promise.all([
    Contest.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Contest.countDocuments(filter).exec(),
  ]);

  const counts = await getParticipantCounts(contests.map((c) => c._id));

  res.status(200).json({
    data: contests.map((c) => ({
      ...toContestSummary(c, counts.get(c.id) ?? 0),
      createdBy: c.createdBy.toString(),
    })),
    pagination: getPagination(page, limit, total),
  });
}

/** GET /api/admin/contests/:id */
export async function getAdminContest(req: Request, res: Response): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  const participantCount = await ContestParticipant.countDocuments({
    contest: contest._id,
  }).exec();

  const detail = await toPopulatedContestDetail(contest, participantCount);
  res.status(200).json({
    data: {
      ...detail,
      createdBy: contest.createdBy.toString(),
    },
  });
}

/** PATCH /api/admin/contests/:id */
export async function updateContest(req: Request, res: Response): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);

  if (contest.status !== 'draft') {
    throw new HttpError(
      409,
      'CONTEST_NOT_EDITABLE',
      'Only draft contests can be edited.'
    );
  }

  const body = req.body as unknown;
  if (!isRecord(body)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Request body must be a JSON object.');
  }

  let hasUpdates = false;

  if (hasOwn(body, 'title')) {
    contest.title = readString(body.title, 'title', {
      min: TITLE_MIN_LENGTH,
      max: TITLE_MAX_LENGTH,
    });
    hasUpdates = true;
  }

  if (hasOwn(body, 'description')) {
    contest.description = readString(body.description, 'description', {
      max: DESCRIPTION_MAX_LENGTH,
    });
    hasUpdates = true;
  }

  if (hasOwn(body, 'startTime')) {
    contest.startTime = readDate(body.startTime, 'startTime');
    hasUpdates = true;
  }

  if (hasOwn(body, 'endTime')) {
    contest.endTime = readDate(body.endTime, 'endTime');
    hasUpdates = true;
  }

  if (hasOwn(body, 'problems')) {
    contest.problems = await parseContestProblems(body.problems);
    hasUpdates = true;
  }

  if (!hasUpdates) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'At least one contest field must be provided.'
    );
  }

  if (contest.endTime <= contest.startTime) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'endTime must be after startTime.'
    );
  }

  await contest.save();

  const participantCount = await ContestParticipant.countDocuments({
    contest: contest._id,
  }).exec();
  const detail = await toPopulatedContestDetail(contest, participantCount);

  res.status(200).json({
    data: {
      ...detail,
      createdBy: contest.createdBy.toString(),
    },
  });
}

/** PATCH /api/admin/contests/:id/status */
export async function updateContestStatus(
  req: Request,
  res: Response
): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  const body = req.body as unknown;
  if (!isRecord(body) || typeof body.status !== 'string') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'status must be provided as a string.'
    );
  }

  if (!isContestStatus(body.status)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      `status must be one of: ${CONTEST_STATUSES.join(', ')}.`
    );
  }

  await transitionContestStatus(contest, body.status);
  const participantCount = await ContestParticipant.countDocuments({
    contest: contest._id,
  }).exec();

  res.status(200).json({
    data: toContestSummary(contest, participantCount),
  });
}

/** POST /api/admin/contests/:id/start */
export async function startContest(req: Request, res: Response): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  await transitionContestStatus(contest, 'live');
  const participantCount = await ContestParticipant.countDocuments({
    contest: contest._id,
  }).exec();

  res.status(200).json({
    data: toContestSummary(contest, participantCount),
  });
}

/** POST /api/admin/contests/:id/end */
export async function endContest(req: Request, res: Response): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  await transitionContestStatus(contest, 'ended');
  const participantCount = await ContestParticipant.countDocuments({
    contest: contest._id,
  }).exec();

  res.status(200).json({
    data: toContestSummary(contest, participantCount),
  });
}

/** DELETE /api/admin/contests/:id */
export async function deleteContest(req: Request, res: Response): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  if (contest.status !== 'draft') {
    throw new HttpError(
      409,
      'CONTEST_NOT_DELETABLE',
      'Only draft contests can be deleted.'
    );
  }

  await removeLeaderboard(contest.id);

  await runInTransaction(async (session) => {
    await ContestParticipant.deleteMany(
      { contest: contest._id },
      session ? { session } : {}
    ).exec();
    await Contest.deleteOne(
      { _id: contest._id },
      session ? { session } : {}
    ).exec();
  });

  res.status(204).send();
}

/** POST /api/admin/contests/:id/leaderboard/rebuild */
export async function rebuildContestLeaderboard(
  req: Request,
  res: Response
): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  const result = await rebuildLeaderboard(contest.id);
  res.status(200).json({ data: result });
}

/** PATCH /api/admin/contests/:id/participants/:userId/disqualify */
export async function disqualifyParticipant(
  req: Request,
  res: Response
): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  const userId = parseObjectId(req.params.userId, 'User id');

  const participant = await ContestParticipant.findOneAndUpdate(
    { contest: contest._id, user: userId },
    { $set: { isDisqualified: true } },
    { new: true }
  ).exec();

  if (!participant) {
    throw new HttpError(
      404,
      'PARTICIPANT_NOT_FOUND',
      'User is not a participant in this contest.'
    );
  }

  await removeUserFromLeaderboard(contest.id, userId.toString());

  res.status(200).json({
    data: {
      contestId: contest.id,
      userId: userId.toString(),
      isDisqualified: participant.isDisqualified,
    },
  });
}

/** GET /api/admin/contests/:id/participants */
export async function listAdminContestParticipants(
  req: Request,
  res: Response
): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);

  const filter = { contest: contest._id };
  const [participants, total] = await Promise.all([
    ContestParticipant.find(filter)
      .sort({ joinedAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email role')
      .lean()
      .exec(),
    ContestParticipant.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: participants.map((p) => {
      const userDoc = p.user as unknown as
        | { _id?: Types.ObjectId; name?: string; email?: string; role?: string }
        | Types.ObjectId;
      const isPopulated =
        userDoc && typeof userDoc === 'object' && 'name' in userDoc;
      return {
        userId: isPopulated
          ? userDoc._id?.toString()
          : (userDoc as Types.ObjectId).toString(),
        ...(isPopulated
          ? { name: userDoc.name, email: userDoc.email, role: userDoc.role }
          : {}),
        joinedAt: p.joinedAt,
        isDisqualified: p.isDisqualified,
      };
    }),
    pagination: getPagination(page, limit, total),
  });
}

/** GET /api/admin/contests/:id/submissions */
export async function listAdminContestSubmissions(
  req: Request,
  res: Response
): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);

  const filter = { contest: contest._id };
  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Submission.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: submissions.map((s) => toSubmissionResponse(s, true)),
    pagination: getPagination(page, limit, total),
  });
}

/** GET /api/contests */
export async function listPublicContests(
  req: Request,
  res: Response
): Promise<void> {
  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const statusQuery = readQueryString(req.query.status, 'status');

  const filter: QueryFilter<IContest> = {
    status: { $in: ['live', 'ended'] },
  };

  if (statusQuery) {
    if (statusQuery !== 'live' && statusQuery !== 'ended') {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        'status must be either "live" or "ended".'
      );
    }
    filter.status = statusQuery;
  }

  const [contests, total] = await Promise.all([
    Contest.find(filter)
      .sort({ status: -1, startTime: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Contest.countDocuments(filter).exec(),
  ]);

  const contestIds = contests.map((c) => c._id);
  const counts = await getParticipantCounts(contestIds);

  const authUser = (req as AuthenticatedRequest).authUser;
  const joinedSet = new Set<string>();
  if (authUser && contestIds.length > 0) {
    const joined = await ContestParticipant.find({
      contest: { $in: contestIds },
      user: new Types.ObjectId(authUser.id),
    })
      .select('contest')
      .lean()
      .exec();
    for (const j of joined) {
      joinedSet.add(j.contest.toString());
    }
  }

  res.status(200).json({
    data: contests.map((c) => ({
      ...toContestSummary(c, counts.get(c.id) ?? 0),
      ...(authUser ? { hasJoined: joinedSet.has(c.id) } : {}),
    })),
    pagination: getPagination(page, limit, total),
  });
}

/** GET /api/contests/:id */
export async function getPublicContest(
  req: Request,
  res: Response
): Promise<void> {
  const contestId = parseObjectId(req.params.id, 'Contest id');
  const contest = await Contest.findOne({
    _id: contestId,
    status: { $in: ['live', 'ended'] },
  }).exec();

  if (!contest) {
    throw new HttpError(404, 'CONTEST_NOT_FOUND', 'Contest not found.');
  }

  const participantCount = await ContestParticipant.countDocuments({
    contest: contest._id,
  }).exec();

  const authUser = (req as AuthenticatedRequest).authUser;
  const participation = authUser
    ? await ContestParticipant.findOne({
        contest: contest._id,
        user: new Types.ObjectId(authUser.id),
      })
        .select('joinedAt isDisqualified')
        .lean()
        .exec()
    : null;

  const detail = await toPopulatedContestDetail(contest, participantCount);

  res.status(200).json({
    data: {
      ...detail,
      ...(authUser
        ? {
            hasJoined: Boolean(participation),
            isDisqualified: participation?.isDisqualified ?? false,
          }
        : {}),
    },
  });
}

/** POST /api/contests/:id/join */
export async function joinContest(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const contest = await findContestOrThrow(req.params.id);

  if (contest.status === 'ended' || contest.endTime <= new Date()) {
    throw new HttpError(
      409,
      'CONTEST_ENDED',
      'Cannot join a contest that has already ended.'
    );
  }

  if (contest.status !== 'live') {
    throw new HttpError(
      409,
      'CONTEST_NOT_LIVE',
      'You can only join a currently live contest.'
    );
  }

  try {
    const participant = await ContestParticipant.create({
      contest: contest._id,
      user: new Types.ObjectId(authUser.id),
    });

    res.status(201).json({
      data: {
        contestId: contest.id,
        userId: authUser.id,
        joinedAt: participant.joinedAt,
        isDisqualified: participant.isDisqualified,
      },
    });
  } catch (error) {
    if (isMongoDuplicateKeyError(error)) {
      throw new HttpError(
        409,
        'ALREADY_JOINED',
        'You have already joined this contest.'
      );
    }
    throw error;
  }
}

/** POST /api/contests/:id/leave */
export async function leaveContest(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const contest = await findContestOrThrow(req.params.id);

  if (contest.status === 'ended') {
    throw new HttpError(
      409,
      'CONTEST_ENDED',
      'Cannot leave a contest that has already ended.'
    );
  }

  const participant = await ContestParticipant.findOne({
    contest: contest._id,
    user: new Types.ObjectId(authUser.id),
  }).exec();

  if (!participant) {
    throw new HttpError(
      404,
      'NOT_PARTICIPANT',
      'You have not joined this contest.'
    );
  }

  if (participant.isDisqualified) {
    throw new HttpError(
      409,
      'CANNOT_LEAVE_DISQUALIFIED',
      'Disqualified participants cannot leave the contest.'
    );
  }

  const hasSubmitted = await Submission.exists({
    contest: contest._id,
    user: new Types.ObjectId(authUser.id),
  }).exec();

  if (hasSubmitted) {
    throw new HttpError(
      409,
      'CANNOT_LEAVE_WITH_SUBMISSIONS',
      'Cannot leave a contest after submitting solutions.'
    );
  }

  await ContestParticipant.deleteOne({ _id: participant._id }).exec();
  res.status(204).send();
}

/** GET /api/contests/:id/participants */
export async function listContestParticipants(
  req: Request,
  res: Response
): Promise<void> {
  const contestId = parseObjectId(req.params.id, 'Contest id');
  const contest = await Contest.findOne({
    _id: contestId,
    status: { $in: ['live', 'ended'] },
  })
    .select('_id')
    .lean()
    .exec();

  if (!contest) {
    throw new HttpError(404, 'CONTEST_NOT_FOUND', 'Contest not found.');
  }

  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const filter = { contest: contest._id, isDisqualified: false };

  const [participants, total] = await Promise.all([
    ContestParticipant.find(filter)
      .sort({ joinedAt: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name')
      .lean()
      .exec(),
    ContestParticipant.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: participants.map((p) => {
      const userDoc = p.user as unknown as
        | { _id?: Types.ObjectId; name?: string }
        | Types.ObjectId;
      const isPopulated =
        userDoc && typeof userDoc === 'object' && 'name' in userDoc;
      return {
        userId: isPopulated
          ? userDoc._id?.toString()
          : (userDoc as Types.ObjectId).toString(),
        name: isPopulated ? userDoc.name : 'Unknown',
        joinedAt: p.joinedAt,
      };
    }),
    pagination: getPagination(page, limit, total),
  });
}

/** GET /api/contests/:id/submissions */
export async function listMyContestSubmissions(
  req: Request,
  res: Response
): Promise<void> {
  const authUser = getAuthUser(req);
  const contestId = parseObjectId(req.params.id, 'Contest id');
  const contest = await Contest.findOne({
    _id: contestId,
    status: { $in: ['live', 'ended'] },
  })
    .select('_id')
    .lean()
    .exec();

  if (!contest) {
    throw new HttpError(404, 'CONTEST_NOT_FOUND', 'Contest not found.');
  }

  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const isAdmin = authUser.role === 'admin' || authUser.role === 'superadmin';
  const filter = {
    contest: contest._id,
    user: new Types.ObjectId(authUser.id),
  };

  const [submissions, total] = await Promise.all([
    Submission.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .exec(),
    Submission.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: submissions.map((s) => toSubmissionResponse(s, isAdmin)),
    pagination: getPagination(page, limit, total),
  });
}

/** GET /api/contests/:id/leaderboard */
export async function getContestLeaderboard(
  req: Request,
  res: Response
): Promise<void> {
  const contestId = parseObjectId(req.params.id, 'Contest id');
  const contest = await Contest.findOne({
    _id: contestId,
    status: { $in: ['live', 'ended'] },
  })
    .select('_id title status')
    .lean()
    .exec();

  if (!contest) {
    throw new HttpError(404, 'CONTEST_NOT_FOUND', 'Contest not found.');
  }

  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);
  const { entries, pagination } = await getLeaderboard(
    contest._id.toString(),
    page,
    limit
  );

  const authUser = (req as AuthenticatedRequest).authUser;
  const currentUserRank = authUser
    ? await getUserRank(contest._id.toString(), authUser.id)
    : null;

  res.status(200).json({
    data: {
      contestId: contest._id.toString(),
      title: contest.title,
      status: contest.status,
      entries,
      ...(authUser ? { currentUserRank } : {}),
    },
    pagination,
  });
}

/** GET /api/admin/contests/:id/flagged */
export async function getFlaggedContestSubmissions(
  req: Request,
  res: Response
): Promise<void> {
  const contest = await findContestOrThrow(req.params.id);
  const { page, limit } = parsePaginationQuery(req.query as Record<string, unknown>);

  const filter = {
    contest: contest._id,
    'plagiarism.flagged': true,
  };

  const [flagged, total] = await Promise.all([
    Submission.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate('user', 'name email')
      .populate('problem', 'title difficulty')
      .select('user problem language plagiarism createdAt')
      .lean()
      .exec(),
    Submission.countDocuments(filter).exec(),
  ]);

  res.status(200).json({
    data: flagged.map((item) => ({
      submissionId: item._id.toString(),
      user: item.user,
      problem: item.problem,
      language: item.language,
      similarity: item.plagiarism?.similarity,
      matchedSubmissionId: item.plagiarism?.matchedSubmission?.toString(),
      createdAt: item.createdAt,
    })),
    pagination: getPagination(page, limit, total),
  });
}
