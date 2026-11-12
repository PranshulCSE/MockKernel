import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { Types } from 'mongoose';
import { Contest } from '../src/models/Contest.js';
import { ContestParticipant } from '../src/models/ContestParticipant.js';
import { Submission } from '../src/models/Submission.js';
import { User } from '../src/models/User.js';
import {
  addScore,
  getLeaderboard,
  getLeaderboardKey,
  getScoredProblemsKey,
  getUserRank,
  parseZrevrangeWithScores,
  rebuildLeaderboard,
  recordAcceptedSubmission,
  removeUserFromLeaderboard,
  type LeaderboardRedisClient,
} from '../src/services/leaderboardService.js';

function createInMemoryLeaderboardRedis(): LeaderboardRedisClient {
  const zsets = new Map<string, Map<string, number>>();
  const sets = new Map<string, Set<string>>();

  const sortedEntries = (key: string) => {
    const map = zsets.get(key);
    if (!map) return [];
    return [...map.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return b[0].localeCompare(a[0]);
    });
  };

  return {
    status: 'ready',
    async zincrby(key, increment, member) {
      let map = zsets.get(key);
      if (!map) {
        map = new Map();
        zsets.set(key, map);
      }
      const next = (map.get(member) ?? 0) + Number(increment);
      map.set(member, next);
      return String(next);
    },
    async zrevrange(key, start, stop) {
      const entries = sortedEntries(key);
      const end = stop < 0 ? entries.length + stop : stop;
      const slice = entries.slice(start, end + 1);
      const flat: string[] = [];
      for (const [member, score] of slice) {
        flat.push(member, String(score));
      }
      return flat;
    },
    async zrevrank(key, member) {
      const entries = sortedEntries(key);
      const idx = entries.findIndex(([m]) => m === member);
      return idx === -1 ? null : idx;
    },
    async zscore(key, member) {
      const val = zsets.get(key)?.get(member);
      return val === undefined ? null : String(val);
    },
    async zcard(key) {
      return zsets.get(key)?.size ?? 0;
    },
    async zrem(key, ...members) {
      const map = zsets.get(key);
      if (!map) return 0;
      let removed = 0;
      for (const m of members) {
        if (map.delete(m)) removed++;
      }
      return removed;
    },
    async sadd(key, ...members) {
      let set = sets.get(key);
      if (!set) {
        set = new Set();
        sets.set(key, set);
      }
      let added = 0;
      for (const m of members) {
        if (!set.has(m)) {
          set.add(m);
          added++;
        }
      }
      return added;
    },
    async del(...keys) {
      let deleted = 0;
      for (const k of keys) {
        if (zsets.delete(k)) deleted++;
        if (sets.delete(k)) deleted++;
      }
      return deleted;
    },
  };
}

function mockQuery<T>(result: T) {
  return {
    select() {
      return this;
    },
    sort() {
      return this;
    },
    lean() {
      return this;
    },
    async exec() {
      return result;
    },
  };
}

test('parseZrevrangeWithScores parses flat WITHSCORES pairs', () => {
  assert.deepEqual(parseZrevrangeWithScores(['u1', '300', 'u2', '150']), [
    { userId: 'u1', score: 300 },
    { userId: 'u2', score: 150 },
  ]);
});

test('addScore and getUserRank update and query Redis ZSET accurately', async () => {
  const redisClient = createInMemoryLeaderboardRedis();
  const contestId = new Types.ObjectId().toString();
  const u1 = new Types.ObjectId().toString();
  const u2 = new Types.ObjectId().toString();

  await addScore(contestId, u1, 100, { redisClient });
  await addScore(contestId, u2, 250, { redisClient });
  const u1Total = await addScore(contestId, u1, 200, { redisClient });

  assert.equal(u1Total, 300);
  assert.deepEqual(await getUserRank(contestId, u1, { redisClient }), {
    rank: 1,
    score: 300,
  });
  assert.deepEqual(await getUserRank(contestId, u2, { redisClient }), {
    rank: 2,
    score: 250,
  });
  assert.equal(
    await getUserRank(contestId, new Types.ObjectId().toString(), { redisClient }),
    null
  );
});

test('recordAcceptedSubmission deduplicates repeat and concurrent Accepted submissions', async (t) => {
  t.after(() => mock.restoreAll());
  const redisClient = createInMemoryLeaderboardRedis();
  const contestId = new Types.ObjectId();
  const problemId = new Types.ObjectId();
  const userId = new Types.ObjectId();

  mock.method(Contest, 'findById', () =>
    mockQuery({
      _id: contestId,
      status: 'live',
      problems: [{ problem: problemId, points: 150, order: 0 }],
    })
  );
  mock.method(ContestParticipant, 'findOne', () =>
    mockQuery({ isDisqualified: false })
  );
  mock.method(Submission, 'exists', () => mockQuery(null));

  // Simulate two concurrent worker completions for the same (user, problem)
  const [r1, r2] = await Promise.all([
    recordAcceptedSubmission(
      {
        contestId: contestId.toString(),
        problemId: problemId.toString(),
        userId: userId.toString(),
        submissionId: new Types.ObjectId().toString(),
      },
      { redisClient }
    ),
    recordAcceptedSubmission(
      {
        contestId: contestId.toString(),
        problemId: problemId.toString(),
        userId: userId.toString(),
        submissionId: new Types.ObjectId().toString(),
      },
      { redisClient }
    ),
  ]);

  const updatedCount = [r1, r2].filter((r) => r.updated).length;
  const skippedCount = [r1, r2].filter(
    (r) => !r.updated && r.reason === 'ALREADY_SOLVED'
  ).length;

  assert.equal(updatedCount, 1);
  assert.equal(skippedCount, 1);
  assert.equal(
    await redisClient.zscore(getLeaderboardKey(contestId.toString()), userId.toString()),
    '150'
  );
});

test('recordAcceptedSubmission skips when contest has ended or participant disqualified', async (t) => {
  t.after(() => mock.restoreAll());
  const redisClient = createInMemoryLeaderboardRedis();
  const contestId = new Types.ObjectId();
  const problemId = new Types.ObjectId();
  const userId = new Types.ObjectId();

  mock.method(Contest, 'findById', () =>
    mockQuery({
      _id: contestId,
      status: 'ended',
      problems: [{ problem: problemId, points: 100, order: 0 }],
    })
  );

  const endedResult = await recordAcceptedSubmission(
    {
      contestId: contestId.toString(),
      problemId: problemId.toString(),
      userId: userId.toString(),
      submissionId: new Types.ObjectId().toString(),
    },
    { redisClient }
  );
  assert.deepEqual(endedResult, { updated: false, reason: 'CONTEST_NOT_LIVE' });

  mock.restoreAll();
  mock.method(Contest, 'findById', () =>
    mockQuery({
      _id: contestId,
      status: 'live',
      problems: [{ problem: problemId, points: 100, order: 0 }],
    })
  );
  mock.method(ContestParticipant, 'findOne', () =>
    mockQuery({ isDisqualified: true })
  );

  const dqResult = await recordAcceptedSubmission(
    {
      contestId: contestId.toString(),
      problemId: problemId.toString(),
      userId: userId.toString(),
      submissionId: new Types.ObjectId().toString(),
    },
    { redisClient }
  );
  assert.deepEqual(dqResult, { updated: false, reason: 'NOT_ELIGIBLE' });
});

test('getLeaderboard auto-rebuilds from MongoDB when Redis data is lost', async (t) => {
  t.after(() => mock.restoreAll());
  const redisClient = createInMemoryLeaderboardRedis();
  const contestId = new Types.ObjectId();
  const p1 = new Types.ObjectId();
  const p2 = new Types.ObjectId();
  const alice = new Types.ObjectId();
  const bob = new Types.ObjectId();
  const dqUser = new Types.ObjectId();

  mock.method(Submission, 'exists', () => mockQuery({ _id: new Types.ObjectId() }));
  mock.method(Contest, 'findById', () =>
    mockQuery({
      _id: contestId,
      problems: [
        { problem: p1, points: 100, order: 0 },
        { problem: p2, points: 200, order: 1 },
      ],
    })
  );
  mock.method(ContestParticipant, 'find', () =>
    mockQuery([
      { user: alice, isDisqualified: false },
      { user: bob, isDisqualified: false },
      { user: dqUser, isDisqualified: true },
    ])
  );
  mock.method(Submission, 'find', () =>
    mockQuery([
      { user: alice, problem: p1 },
      { user: alice, problem: p1 }, // repeat accepted should not double-count
      { user: alice, problem: p2 },
      { user: bob, problem: p2 },
      { user: dqUser, problem: p1 }, // disqualified should be excluded
    ])
  );
  mock.method(User, 'find', () =>
    mockQuery([
      { _id: alice, name: 'Alice' },
      { _id: bob, name: 'Bob' },
    ])
  );

  const board = await getLeaderboard(contestId.toString(), 1, 10, { redisClient });

  assert.deepEqual(board.entries, [
    { rank: 1, userId: alice.toString(), name: 'Alice', score: 300 },
    { rank: 2, userId: bob.toString(), name: 'Bob', score: 200 },
  ]);
  assert.deepEqual(board.pagination, {
    page: 1,
    limit: 10,
    total: 2,
    totalPages: 1,
  });

  // Verify removal clears both score and scored-problem set
  await removeUserFromLeaderboard(contestId.toString(), alice.toString(), {
    redisClient,
  });
  assert.equal(
    await redisClient.zscore(getLeaderboardKey(contestId.toString()), alice.toString()),
    null
  );
  assert.equal(
    await redisClient.sadd(
      getScoredProblemsKey(contestId.toString(), alice.toString()),
      p1.toString()
    ),
    1
  );

  const rebuilt = await rebuildLeaderboard(contestId.toString(), { redisClient });
  assert.deepEqual(rebuilt, { entriesCount: 2, submissionsProcessed: 3 });
});
