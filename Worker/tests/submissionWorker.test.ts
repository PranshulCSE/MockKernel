import { UnrecoverableError } from 'bullmq';
import { Types } from 'mongoose';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Submission, type ITestCaseResult } from '../src/models/Submission.js';
import {
  processSubmissionJob,
  validateSubmissionJobData,
} from '../src/queues/submissionWorker.js';
import { Judge0Error, type Judge0Service } from '../src/services/judge0.js';

describe('Worker submission job validation, execution, partial persistence, and retries', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects malformed job payloads with UnrecoverableError without crashing', async () => {
    expect(() => validateSubmissionJobData(null)).toThrow(UnrecoverableError);
    expect(() => validateSubmissionJobData({ submissionId: 'bad', testCases: [] })).toThrow(
      UnrecoverableError
    );

    const subId = new Types.ObjectId().toString();
    expect(() =>
      validateSubmissionJobData({ submissionId: subId, testCases: [] })
    ).toThrow(UnrecoverableError);

    const tcId = new Types.ObjectId().toString();
    expect(() =>
      validateSubmissionJobData({
        submissionId: subId,
        testCases: [
          { testCaseId: tcId, input: '', expectedOutput: '' },
          { testCaseId: tcId, input: '', expectedOutput: '' },
        ],
      })
    ).toThrow(/duplicate testCaseId/);

    expect(() =>
      validateSubmissionJobData({
        submissionId: subId,
        testCases: [{ testCaseId: tcId, input: 123, expectedOutput: '' }],
      })
    ).toThrow(/input must be a string/);

    // If submissionId is valid but testCases malformed, marks submission INTERNAL_ERROR safely
    const updateSpy = vi
      .spyOn(Submission, 'findByIdAndUpdate')
      .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) } as never);

    await expect(
      processSubmissionJob({
        id: 'job-bad',
        data: { submissionId: subId, testCases: [] },
      })
    ).rejects.toThrow(UnrecoverableError);

    expect(updateSpy).toHaveBeenCalledWith(
      subId,
      expect.objectContaining({
        $set: expect.objectContaining({ verdict: 'INTERNAL_ERROR' }),
      })
    );
  });

  it('skips already-finalized submissions idempotently', async () => {
    const subId = new Types.ObjectId().toString();
    const tcId = new Types.ObjectId().toString();

    vi.spyOn(Submission, 'findById').mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(subId),
        verdict: 'ACCEPTED',
        language: 'python',
        sourceCode: 'print(1)',
      }),
    } as never);

    const executeSpy = vi.fn();
    await processSubmissionJob(
      {
        id: subId,
        data: {
          submissionId: subId,
          testCases: [{ testCaseId: tcId, input: '', expectedOutput: '1' }],
        },
      },
      { judge0: { executeTestCase: executeSpy } as unknown as Judge0Service }
    );

    expect(executeSpy).not.toHaveBeenCalled();
  });

  it('stops immediately on COMPILE_ERROR and persists compileOutput', async () => {
    const subId = new Types.ObjectId().toString();
    const tc1 = new Types.ObjectId().toString();
    const tc2 = new Types.ObjectId().toString();

    vi.spyOn(Submission, 'findById').mockReturnValue({
      exec: vi.fn().mockResolvedValue({
        _id: new Types.ObjectId(subId),
        verdict: 'PENDING',
        language: 'cpp',
        sourceCode: 'broken code',
        testCaseResults: [],
      }),
    } as never);

    const updateSpy = vi
      .spyOn(Submission, 'findByIdAndUpdate')
      .mockReturnValue({ exec: vi.fn().mockResolvedValue(null) } as never);

    const executeSpy = vi.fn().mockResolvedValue({
      token: 'tok-ce',
      verdict: 'COMPILE_ERROR',
      passed: false,
      compileOutput: 'error: expected ;',
    });

    await processSubmissionJob(
      {
        id: subId,
        data: {
          submissionId: subId,
          testCases: [
            { testCaseId: tc1, input: '1', expectedOutput: '1' },
            { testCaseId: tc2, input: '2', expectedOutput: '2' },
          ],
        },
      },
      { judge0: { executeTestCase: executeSpy } as unknown as Judge0Service }
    );

    expect(executeSpy).toHaveBeenCalledTimes(1);
    const finalCall = updateSpy.mock.calls.at(-1)?.[1] as {
      $set: { verdict: string; compileOutput: string; testCaseResults: ITestCaseResult[] };
    };
    expect(finalCall.$set.verdict).toBe('COMPILE_ERROR');
    expect(finalCall.$set.compileOutput).toBe('error: expected ;');
    expect(finalCall.$set.testCaseResults).toHaveLength(1);
  });

  it('persists partial results on transient failure and retries without duplicating testCaseResults', async () => {
    const subId = new Types.ObjectId().toString();
    const tc1 = new Types.ObjectId().toString();
    const tc2 = new Types.ObjectId().toString();

    const storedSubmission = {
      _id: new Types.ObjectId(subId),
      verdict: 'PENDING' as string,
      language: 'python' as const,
      sourceCode: 'print(input())',
      testCaseResults: undefined as ITestCaseResult[] | undefined,
      compileOutput: undefined as string | undefined,
      judge0Token: undefined as string | undefined,
    };

    vi.spyOn(Submission, 'findById').mockImplementation((() => ({
      exec: vi.fn().mockResolvedValue(storedSubmission),
    })) as never);

    vi.spyOn(Submission, 'findByIdAndUpdate').mockImplementation(((_id: unknown, update: unknown) => {
      const setPayload = (update as { $set: Record<string, unknown> }).$set;
      Object.assign(storedSubmission, setPayload);
      return { exec: vi.fn().mockResolvedValue(storedSubmission) } as never;
    }) as never);

    const executeSpy = vi
      .fn()
      // Attempt 1: tc1 passes, tc2 fails with transient Judge0Error
      .mockResolvedValueOnce({
        token: 'tok-1',
        verdict: 'ACCEPTED',
        passed: true,
        runtime: 15,
        memory: 512,
        stdout: 'a',
      })
      .mockRejectedValueOnce(
        new Judge0Error('JUDGE0_UNREACHABLE', 'Connection reset', { retryable: true })
      )
      // Attempt 2 (retry): tc1 is skipped because already persisted; tc2 runs and passes
      .mockResolvedValueOnce({
        token: 'tok-2',
        verdict: 'ACCEPTED',
        passed: true,
        runtime: 20,
        memory: 640,
        stdout: 'b',
      });

    const job = {
      id: subId,
      data: {
        submissionId: subId,
        testCases: [
          { testCaseId: tc1, input: 'a', expectedOutput: 'a' },
          { testCaseId: tc2, input: 'b', expectedOutput: 'b' },
        ],
      },
    };

    // Attempt 1 fails and persists partial tc1 result + INTERNAL_ERROR
    await expect(
      processSubmissionJob(job, {
        judge0: { executeTestCase: executeSpy } as unknown as Judge0Service,
      })
    ).rejects.toThrow(/Connection reset/);

    expect(storedSubmission.verdict).toBe('INTERNAL_ERROR');
    expect(storedSubmission.testCaseResults).toHaveLength(1);
    expect(storedSubmission.testCaseResults?.[0]?.testCase.toString()).toBe(tc1);

    // Attempt 2 (retry) succeeds without re-running tc1 or duplicating results
    await processSubmissionJob(job, {
      judge0: { executeTestCase: executeSpy } as unknown as Judge0Service,
    });

    expect(executeSpy).toHaveBeenCalledTimes(3);
    expect(storedSubmission.verdict).toBe('ACCEPTED');
    expect(storedSubmission.testCaseResults).toHaveLength(2);
    expect(storedSubmission.testCaseResults?.map((r) => r.testCase.toString())).toEqual([
      tc1,
      tc2,
    ]);
  });
});
