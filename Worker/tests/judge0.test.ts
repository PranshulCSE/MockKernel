import { AxiosError, type AxiosInstance } from 'axios';
import { describe, expect, it, vi } from 'vitest';
import { Judge0Error, Judge0Service } from '../src/services/judge0.js';

describe('Judge0Service', () => {
  it('maps Judge0 status IDs to SubmissionVerdict accurately', () => {
    const service = new Judge0Service({ apiUrl: 'http://localhost:2358' });

    expect(service.mapStatusToVerdict(1)).toBe('PENDING');
    expect(service.mapStatusToVerdict(2)).toBe('RUNNING');
    expect(service.mapStatusToVerdict(3)).toBe('ACCEPTED');
    expect(service.mapStatusToVerdict(4)).toBe('WRONG_ANSWER');
    expect(service.mapStatusToVerdict(5)).toBe('TLE');
    expect(service.mapStatusToVerdict(6)).toBe('COMPILE_ERROR');
    expect(service.mapStatusToVerdict(7)).toBe('RUNTIME_ERROR');
    expect(service.mapStatusToVerdict(11)).toBe('RUNTIME_ERROR');
    expect(service.mapStatusToVerdict(12)).toBe('RUNTIME_ERROR');
    expect(service.mapStatusToVerdict(13)).toBe('INTERNAL_ERROR');
    expect(service.mapStatusToVerdict(14)).toBe('INTERNAL_ERROR');
    expect(service.mapStatusToVerdict(999)).toBe('INTERNAL_ERROR');
  });

  it('preserves empty strings for both stdin and expected_output when submitting to Judge0', async () => {
    const postMock = vi.fn().mockResolvedValue({ data: { token: 'tok-empty-1' } });
    const getMock = vi.fn().mockResolvedValue({
      data: {
        token: 'tok-empty-1',
        status: { id: 3, description: 'Accepted' },
        stdout: '',
        stderr: '',
        time: '0.012',
        memory: 0,
      },
    });

    const service = new Judge0Service({
      client: { post: postMock, get: getMock } as unknown as AxiosInstance,
      pollIntervalMs: 10,
      maxPollAttempts: 3,
      sleep: async () => {},
    });

    const result = await service.executeTestCase('print("")', 'python', '', '');

    expect(postMock).toHaveBeenCalledWith(
      '/submissions?base64_encoded=false&wait=false',
      expect.objectContaining({
        source_code: 'print("")',
        language_id: 71,
        stdin: '',
        expected_output: '',
      })
    );
    expect(result).toEqual({
      token: 'tok-empty-1',
      verdict: 'ACCEPTED',
      passed: true,
      runtime: 12,
      memory: 0,
      stdout: '',
      stderr: '',
      compileOutput: undefined,
    });
  });

  it('polls across In Queue / Processing states and returns compile/runtime/TLE errors', async () => {
    const postMock = vi.fn().mockResolvedValue({ data: { token: 'tok-poll' } });
    const getMock = vi
      .fn()
      .mockResolvedValueOnce({ data: { token: 'tok-poll', status: { id: 1, description: 'In Queue' } } })
      .mockResolvedValueOnce({ data: { token: 'tok-poll', status: { id: 2, description: 'Processing' } } })
      .mockResolvedValueOnce({
        data: {
          token: 'tok-poll',
          status: { id: 6, description: 'Compilation Error' },
          compile_output: 'SyntaxError: invalid syntax',
        },
      });

    const service = new Judge0Service({
      client: { post: postMock, get: getMock } as unknown as AxiosInstance,
      pollIntervalMs: 10,
      maxPollAttempts: 5,
      sleep: async () => {},
    });

    const res = await service.executeTestCase('def (', 'python', '1', '1');
    expect(getMock).toHaveBeenCalledTimes(3);
    expect(res.verdict).toBe('COMPILE_ERROR');
    expect(res.passed).toBe(false);
    expect(res.compileOutput).toBe('SyntaxError: invalid syntax');
  });

  it('enforces the 10s hard execution guard when Judge0 keeps processing', async () => {
    let now = 0;
    const dateNowSpy = vi.spyOn(Date, 'now').mockImplementation(() => now);
    const postMock = vi.fn().mockResolvedValue({ data: { token: 'tok-hang' } });
    const getMock = vi.fn().mockResolvedValue({
      data: { token: 'tok-hang', status: { id: 2, description: 'Processing' } },
    });
    const sleep = vi.fn(async (ms: number) => {
      now += ms;
    });

    const service = new Judge0Service({
      client: { post: postMock, get: getMock } as unknown as AxiosInstance,
      pollIntervalMs: 1000,
      maxPollAttempts: 100,
      executionTimeoutMs: 10_000,
      sleep,
    });

    try {
      await expect(
        service.executeTestCase('while True: pass', 'python', '', '')
      ).rejects.toMatchObject({
        name: 'Judge0Error',
        code: 'JUDGE0_POLL_TIMEOUT',
        retryable: false,
      });
    } finally {
      dateNowSpy.mockRestore();
    }

    expect(now).toBeLessThanOrEqual(10_000);
    expect(now).toBeGreaterThanOrEqual(9_000);
    expect(getMock.mock.calls.length).toBeLessThanOrEqual(10);
  });

  it('throws non-retryable Judge0Error on poll timeout and retryable errors on network failures, non-retryable on 401', async () => {
    const postMock = vi.fn().mockResolvedValue({ data: { token: 'tok-timeout' } });
    const getMock = vi.fn().mockResolvedValue({
      data: { token: 'tok-timeout', status: { id: 2, description: 'Processing' } },
    });

    const service = new Judge0Service({
      client: { post: postMock, get: getMock } as unknown as AxiosInstance,
      pollIntervalMs: 10,
      maxPollAttempts: 2,
      sleep: async () => {},
    });

    await expect(service.executeTestCase('while True: pass', 'python', '', '')).rejects.toMatchObject({
      name: 'Judge0Error',
      code: 'JUDGE0_POLL_TIMEOUT',
      retryable: false,
    });

    const authErr = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, {
      status: 401,
    } as never);
    const authService = new Judge0Service({
      client: { post: vi.fn().mockRejectedValue(authErr), get: vi.fn() } as unknown as AxiosInstance,
      pollIntervalMs: 10,
      maxPollAttempts: 2,
      sleep: async () => {},
    });

    await expect(authService.executeTestCase('print(1)', 'python', '', '')).rejects.toSatisfy(
      (err: unknown) => err instanceof Judge0Error && err.code === 'JUDGE0_AUTH_ERROR' && !err.retryable
    );
  });
});
