import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { getAuthUser } from '../middleware/auth.js';
import { ContestParticipant } from '../models/ContestParticipant.js';
import { InterviewSession } from '../models/InterviewSession.js';
import { Submission } from '../models/Submission.js';

interface CountRow {
  count: number;
}

interface SubmissionStatsFacet {
  solvedProblems: CountRow[];
  attemptedProblems: CountRow[];
  totalSubmissions: CountRow[];
}

interface InterviewStatsRow {
  _id: null;
  total: number;
  completed: number;
  inProgress: number;
  abandoned: number;
  averageScore: number | null;
}

function countFromFacet(rows: CountRow[] | undefined): number {
  return rows?.[0]?.count ?? 0;
}

/**
 * GET /api/users/me/stats
 *
 * The dashboard needs aggregates that the paginated submission/interview
 * list endpoints do not expose. Keep the calculation server-side so the
 * client never has to page through all activity to build its KPI tiles.
 */
export async function getMyStats(req: Request, res: Response): Promise<void> {
  const authUser = getAuthUser(req);
  const userId = new Types.ObjectId(authUser.id);

  const [submissionRows, contestsJoined, interviewRows] = await Promise.all([
    Submission.aggregate<SubmissionStatsFacet>([
      { $match: { user: userId, mode: 'submit' } },
      {
        $facet: {
          solvedProblems: [
            { $match: { verdict: 'ACCEPTED' } },
            { $group: { _id: '$problem' } },
            { $count: 'count' },
          ],
          attemptedProblems: [
            { $group: { _id: '$problem' } },
            { $count: 'count' },
          ],
          totalSubmissions: [{ $count: 'count' }],
        },
      },
    ]).exec(),
    ContestParticipant.countDocuments({ user: userId }).exec(),
    InterviewSession.aggregate<InterviewStatsRow>([
      { $match: { user: userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
          },
          inProgress: {
            $sum: { $cond: [{ $eq: ['$status', 'in_progress'] }, 1, 0] },
          },
          abandoned: {
            $sum: { $cond: [{ $eq: ['$status', 'abandoned'] }, 1, 0] },
          },
          averageScore: {
            $avg: {
              $cond: [
                { $eq: ['$status', 'completed'] },
                '$overallScore',
                null,
              ],
            },
          },
        },
      },
    ]).exec(),
  ]);

  const submissionStats = submissionRows[0];
  const interviewStats = interviewRows[0];
  const averageInterviewScore =
    typeof interviewStats?.averageScore === 'number' &&
    Number.isFinite(interviewStats.averageScore)
      ? Math.round(interviewStats.averageScore * 10) / 10
      : null;

  res.status(200).json({
    data: {
      solvedProblems: countFromFacet(submissionStats?.solvedProblems),
      attemptedProblems: countFromFacet(submissionStats?.attemptedProblems),
      totalSubmissions: countFromFacet(submissionStats?.totalSubmissions),
      contestsJoined,
      interviewsStarted: interviewStats?.total ?? 0,
      interviewsCompleted: interviewStats?.completed ?? 0,
      interviewsInProgress: interviewStats?.inProgress ?? 0,
      interviewsAbandoned: interviewStats?.abandoned ?? 0,
      averageInterviewScore,
    },
  });
}
