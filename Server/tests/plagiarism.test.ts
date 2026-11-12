import assert from 'node:assert/strict';
import test, { mock } from 'node:test';
import { Types } from 'mongoose';
import { Contest } from '../src/models/Contest.js';
import { ContestParticipant } from '../src/models/ContestParticipant.js';
import { Submission } from '../src/models/Submission.js';
import { normalizeCode } from '../src/services/plagiarism/normalizer.js';
import {
  checkPlagiarism,
  processPlagiarismCheck,
} from '../src/services/plagiarism/plagiarismService.js';
import { computeSimilarity } from '../src/services/plagiarism/similarity.js';

function mockQuery<T>(result: T) {
  return {
    select() {
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

test('normalizeCode strips comments/whitespace and normalizes renamed variables across languages', () => {
  const pyA = `
# Compute two sum
def solve(nums, target):
    seen = {}
    for idx, val in enumerate(nums):
        diff = target - val
        if diff in seen:
            return [seen[diff], idx]
        seen[val] = idx
    return []
`;
  const pyB = `
'''Different formatting and variable names'''
def find_pair(arr, goal):
    lookup = {}
    for i, item in enumerate(arr):
        rem = goal - item
        if rem in lookup:
            return [lookup[rem], i]
        lookup[item] = i
    return []
`;

  const normA = normalizeCode(pyA, 'python');
  const normB = normalizeCode(pyB, 'python');
  assert.equal(normA, normB);
  assert.equal(computeSimilarity(normA, normB), 1);

  const cppA = `
// sum array
int sumArray(int n, int arr[]) {
  int total = 0;
  for (int i = 0; i < n; i++) {
    total += arr[i];
  }
  return total;
}
`;
  const cppB = `
/* renamed identifiers */
int calc(int len, int items[]) {
  int acc = 0;
  for (int j = 0; j < len; j++) {
    acc += items[j];
  }
  return acc;
}
`;
  const normCppA = normalizeCode(cppA, 'cpp');
  const normCppB = normalizeCode(cppB, 'cpp');
  assert.ok(computeSimilarity(normCppA, normCppB) >= 0.9);
});

test('computeSimilarity distinguishes plagiarized vs distinct algorithms', () => {
  const code1 = normalizeCode(
    `
function twoSum(nums, target) {
  const map = new Map();
  for (let i = 0; i < nums.length; i++) {
    const need = target - nums[i];
    if (map.has(need)) return [map.get(need), i];
    map.set(nums[i], i);
  }
  return [];
}
`,
    'javascript'
  );
  const code2 = normalizeCode(
    `
function binarySearch(arr, x) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid] === x) return mid;
    if (arr[mid] < x) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}
`,
    'javascript'
  );

  assert.ok(computeSimilarity(code1, code2) < 0.65);
});

test('checkPlagiarism and processPlagiarismCheck flag copies in live contests and skip boilerplate', async (t) => {
  t.after(() => mock.restoreAll());
  const contestId = new Types.ObjectId();
  const problemId = new Types.ObjectId();
  const userA = new Types.ObjectId();
  const userB = new Types.ObjectId();
  const prevSubId = new Types.ObjectId();
  const newSubId = new Types.ObjectId();

  const sourceA = `
def solve(nums, target):
    seen = {}
    for idx, val in enumerate(nums):
        diff = target - val
        if diff in seen:
            return [seen[diff], idx]
        seen[val] = idx
    return []
`;
  const sourceB = `
def answer(arr, goal):
    memo = {}
    for pos, elem in enumerate(arr):
        need = goal - elem
        if need in memo:
            return [memo[need], pos]
        memo[elem] = pos
    return []
`;

  mock.method(Contest, 'findById', () => mockQuery({ status: 'live' }));
  mock.method(Submission, 'find', () =>
    mockQuery([{ _id: prevSubId, language: 'python', sourceCode: sourceA }])
  );

  const subDoc = {
    _id: newSubId,
    contest: contestId,
    problem: problemId,
    user: userB,
    language: 'python' as const,
    sourceCode: sourceB,
    mode: 'submit' as const,
    verdict: 'ACCEPTED' as string,
    plagiarism: undefined as unknown,
    async save() {
      return this;
    },
  };

  const check = await checkPlagiarism(subDoc as never, 0.85);
  assert.equal(check.flagged, true);
  assert.ok(check.similarity >= 0.85);
  assert.equal(check.matchedSubmissionId, prevSubId.toString());

  mock.method(Submission, 'findById', () => mockQuery(subDoc));
  const flagged = await processPlagiarismCheck(newSubId.toString());
  assert.equal(flagged, true);
  assert.equal(subDoc.verdict, 'PLAGIARISM_FLAGGED');

  // Ended contest should not flag
  mock.method(Contest, 'findById', () => mockQuery({ status: 'ended' }));
  const endedCheck = await checkPlagiarism(
    { ...subDoc, verdict: 'ACCEPTED', user: userA } as never,
    0.85
  );
  assert.equal(endedCheck.flagged, false);
  void ContestParticipant;
});
