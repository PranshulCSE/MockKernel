import axios, { AxiosError, type AxiosInstance } from 'axios';
import { getWorkerEnvConfig } from '../config/env.js';
import type { SubmissionVerdict, SupportedLanguage } from '../models/Submission.js';
import { getLocalRunnerService, type LocalRunnerService } from './localRunner.js';

export const LANGUAGE_ID_MAP: Record<SupportedLanguage, number> = {
  python: 71,
  cpp: 54,
  java: 62,
  javascript: 63,
};

/**
 * PRD execution SLA: a hanging Judge0 execution must be classified as TLE
 * within 10 seconds, regardless of the configured polling attempt count.
 */
export const DEFAULT_EXECUTION_TIMEOUT_MS = 10_000;

export interface Judge0SubmissionPayload {
  source_code: string;
  language_id: number;
  stdin: string;
  expected_output?: string;
  cpu_time_limit?: number;
  memory_limit?: number;
}

export interface Judge0Status {
  id: number;
  description: string;
}

export interface Judge0Response {
  token: string;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
  time?: string | null;
  memory?: number | null;
  status: Judge0Status;
}

export interface ExecutionResult {
  token: string;
  verdict: SubmissionVerdict;
  passed: boolean;
  runtime?: number;
  memory?: number;
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
}

export class Judge0Error extends Error {
  public readonly code: string;
  public readonly statusCode?: number;
  public readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    options: { statusCode?: number; retryable?: boolean } = {}
  ) {
    super(message);
    this.name = 'Judge0Error';
    this.code = code;
    this.statusCode = options.statusCode;
    this.retryable = options.retryable ?? false;
  }
}

export interface Judge0ServiceOptions {
  apiUrl?: string;
  apiKey?: string;
  pollIntervalMs?: number;
  maxPollAttempts?: number;
  executionTimeoutMs?: number;
  client?: AxiosInstance;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Judge0Service {
  private client: AxiosInstance;
  private pollIntervalMs: number;
  private maxPollAttempts: number;
  private executionTimeoutMs: number;
  private sleep: (ms: number) => Promise<void>;
  private localRunner: LocalRunnerService;

  constructor(options: Judge0ServiceOptions = {}) {
    const env = getWorkerEnvConfig();
    const apiUrl = options.apiUrl ?? env.judge0ApiUrl;
    const apiKey = options.apiKey ?? env.judge0ApiKey;

    this.localRunner = getLocalRunnerService();
    this.pollIntervalMs = options.pollIntervalMs ?? env.pollIntervalMs;
    this.maxPollAttempts = options.maxPollAttempts ?? env.maxPollAttempts;
    this.executionTimeoutMs = options.executionTimeoutMs ?? DEFAULT_EXECUTION_TIMEOUT_MS;
    this.sleep = options.sleep ?? defaultSleep;

    if (options.client) {
      this.client = options.client;
    } else {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['X-Auth-Token'] = apiKey;
      }

      this.client = axios.create({
        baseURL: apiUrl,
        headers,
        timeout: 10_000,
      });
    }
  }

  /**
   * Maps Judge0 status id to MockKernel SubmissionVerdict.
   * 1: In Queue, 2: Processing, 3: Accepted, 4: Wrong Answer,
   * 5: Time Limit Exceeded, 6: Compilation Error,
   * 7..12: Runtime Error, 13..14: Internal / Exec Format Error
   */
  public mapStatusToVerdict(statusId: number): SubmissionVerdict {
    switch (statusId) {
      case 1:
        return 'PENDING';
      case 2:
        return 'RUNNING';
      case 3:
        return 'ACCEPTED';
      case 4:
        return 'WRONG_ANSWER';
      case 5:
        return 'TLE';
      case 6:
        return 'COMPILE_ERROR';
      case 7:
      case 8:
      case 9:
      case 10:
      case 11:
      case 12:
        return 'RUNTIME_ERROR';
      case 13:
      case 14:
      default:
        return 'INTERNAL_ERROR';
    }
  }

  private wrapAxiosError(error: unknown, operation: string): Judge0Error {
    if (error instanceof Judge0Error) {
      return error;
    }

    if (axios.isAxiosError(error)) {
      const axiosErr = error as AxiosError;
      const status = axiosErr.response?.status;

      if (axiosErr.code === 'ECONNABORTED' || axiosErr.code === 'ETIMEDOUT') {
        return new Judge0Error(
          'JUDGE0_TIMEOUT',
          `Judge0 request timed out during ${operation}.`,
          { retryable: true }
        );
      }

      if (!axiosErr.response) {
        return new Judge0Error(
          'JUDGE0_UNREACHABLE',
          `Unable to reach Judge0 during ${operation}: ${axiosErr.message}`,
          { retryable: true }
        );
      }

      if (status === 401 || status === 403) {
        return new Judge0Error(
          'JUDGE0_AUTH_ERROR',
          `Judge0 rejected authentication credentials (HTTP ${status}).`,
          { statusCode: status, retryable: false }
        );
      }

      if (status !== undefined && status >= 500) {
        return new Judge0Error(
          'JUDGE0_SERVER_ERROR',
          `Judge0 returned HTTP ${status} during ${operation}.`,
          { statusCode: status, retryable: true }
        );
      }

      return new Judge0Error(
        'JUDGE0_REQUEST_ERROR',
        `Judge0 rejected request during ${operation} (HTTP ${status ?? 'unknown'}).`,
        { statusCode: status, retryable: false }
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    return new Judge0Error(
      'JUDGE0_UNKNOWN_ERROR',
      `Unexpected Judge0 error during ${operation}: ${message}`,
      { retryable: true }
    );
  }

  public async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    if (process.env.USE_LOCAL_RUNNER === 'true' || process.env.JUDGE0_API_URL === 'local') {
      return this.localRunner.checkHealth();
    }
    try {
      const res = await this.client.get('/about');
      if (res.status >= 200 && res.status < 300) {
        return { ok: true };
      }
      return { ok: false, message: `HTTP ${res.status}` };
    } catch (error) {
      if (process.env.USE_LOCAL_RUNNER === 'true' || process.env.NODE_ENV === 'development') {
        return this.localRunner.checkHealth();
      }
      const wrapped = this.wrapAxiosError(error, 'health check');
      return { ok: false, message: wrapped.message };
    }
  }

  public async submitCode(payload: Judge0SubmissionPayload): Promise<string> {
    try {
      const response = await this.client.post<{ token?: unknown }>(
        '/submissions?base64_encoded=false&wait=false',
        payload
      );

      if (typeof response.data?.token !== 'string' || response.data.token.length === 0) {
        throw new Judge0Error(
          'JUDGE0_INVALID_RESPONSE',
          'Judge0 did not return a valid submission token.',
          { retryable: true }
        );
      }

      return response.data.token;
    } catch (error) {
      throw this.wrapAxiosError(error, 'submitCode');
    }
  }

  private createPollTimeoutError(token: string): Judge0Error {
    return new Judge0Error(
      'JUDGE0_POLL_TIMEOUT',
      `Judge0 execution did not complete within the ${this.executionTimeoutMs}ms timeout guard for token ${token}.`,
      { retryable: false }
    );
  }

  private async getWithDeadline<T>(
    url: string,
    deadline: number,
    token: string
  ): Promise<{ data: T }> {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      throw this.createPollTimeoutError(token);
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.client.get<T>(url),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(this.createPollTimeoutError(token)),
            remainingMs
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    }
  }

  public async pollSubmission(token: string): Promise<Judge0Response> {
    const deadline = Date.now() + this.executionTimeoutMs;
    let attempts = 0;

    while (attempts < this.maxPollAttempts) {
      if (Date.now() >= deadline) {
        break;
      }

      attempts++;

      let data: Judge0Response;
      try {
        const response = await this.getWithDeadline<Judge0Response>(
          `/submissions/${token}?base64_encoded=false`,
          deadline,
          token
        );
        data = response.data;
      } catch (error) {
        throw this.wrapAxiosError(error, 'pollSubmission');
      }

      const statusId = data?.status?.id;
      if (typeof statusId !== 'number') {
        throw new Judge0Error(
          'JUDGE0_INVALID_RESPONSE',
          `Judge0 returned malformed status payload for token ${token}.`,
          { retryable: true }
        );
      }

      // Status 1 = In Queue, 2 = Processing
      if (statusId !== 1 && statusId !== 2) {
        return data;
      }

      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0 || attempts >= this.maxPollAttempts) {
        break;
      }

      await this.sleep(Math.min(this.pollIntervalMs, remainingMs));
    }

    throw this.createPollTimeoutError(token);
  }

  /**
   * Submits and polls execution for a single test case.
   * Preserves empty strings ('') for both stdin and expectedOutput.
   */
  public async executeTestCase(
    sourceCode: string,
    language: SupportedLanguage,
    stdin?: string,
    expectedOutput?: string,
    cpuTimeLimit?: number,
    memoryLimit?: number
  ): Promise<ExecutionResult> {
    if (process.env.USE_LOCAL_RUNNER === 'true' || process.env.JUDGE0_API_URL === 'local') {
      return this.localRunner.executeTestCase(
        sourceCode,
        language,
        stdin,
        expectedOutput,
        cpuTimeLimit,
        memoryLimit
      );
    }

    try {
      const languageId = LANGUAGE_ID_MAP[language];
      if (!languageId) {
        throw new Judge0Error(
          'UNSUPPORTED_LANGUAGE',
          `Unsupported language: ${language}`,
          { retryable: false }
        );
      }

      const payload: Judge0SubmissionPayload = {
        source_code: sourceCode,
        language_id: languageId,
        stdin: stdin ?? '',
        ...(expectedOutput !== undefined ? { expected_output: expectedOutput } : {}),
        ...(cpuTimeLimit !== undefined ? { cpu_time_limit: cpuTimeLimit } : {}),
        ...(memoryLimit !== undefined ? { memory_limit: memoryLimit } : {}),
      };

      const token = await this.submitCode(payload);
      const result = await this.pollSubmission(token);

      const verdict = this.mapStatusToVerdict(result.status.id);
      const passed = verdict === 'ACCEPTED';
      const parsedTime =
        result.time !== undefined && result.time !== null
          ? Number.parseFloat(result.time)
          : Number.NaN;
      const runtimeMs = Number.isFinite(parsedTime)
        ? Math.round(parsedTime * 1000)
        : undefined;

      return {
        token,
        verdict,
        passed,
        runtime: runtimeMs,
        memory: result.memory ?? undefined,
        stdout: result.stdout ?? undefined,
        stderr: result.stderr ?? undefined,
        compileOutput: result.compile_output ?? undefined,
      };
    } catch (error) {
      if (
        (error instanceof Judge0Error &&
          (error.code === 'JUDGE0_UNREACHABLE' || error.code === 'JUDGE0_TIMEOUT')) ||
        process.env.NODE_ENV === 'development'
      ) {
        console.warn(
          `[Worker] Judge0 unavailable (${(error as Error).message}). Executing via Local Code Runner.`
        );
        return this.localRunner.executeTestCase(
          sourceCode,
          language,
          stdin,
          expectedOutput,
          cpuTimeLimit,
          memoryLimit
        );
      }
      throw error;
    }
  }
}

let defaultJudge0Service: Judge0Service | null = null;

export function getJudge0Service(): Judge0Service {
  if (!defaultJudge0Service) {
    defaultJudge0Service = new Judge0Service();
  }
  return defaultJudge0Service;
}

export const judge0Service: Judge0Service = new Proxy({} as Judge0Service, {
  get(_target, prop) {
    const svc = getJudge0Service();
    const value = Reflect.get(svc, prop, svc);
    return typeof value === 'function' ? value.bind(svc) : value;
  },
});
