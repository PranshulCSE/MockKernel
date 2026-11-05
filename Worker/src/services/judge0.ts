import axios, { AxiosInstance } from 'axios';
import dotenv from 'dotenv';
import { SupportedLanguage, SubmissionVerdict } from '../models/Submission.js';

dotenv.config();

const JUDGE0_API_URL = process.env.JUDGE0_API_URL || 'http://localhost:2358';
const JUDGE0_API_KEY = process.env.JUDGE0_API_KEY || '';
const POLL_INTERVAL_MS = Number(process.env.POLL_INTERVAL_MS) || 1000;
const MAX_POLL_ATTEMPTS = Number(process.env.MAX_POLL_ATTEMPTS) || 20;

/**
 * Standard Judge0 Language IDs
 * Adjust here if your Judge0 environment uses alternative builds.
 */
export const LANGUAGE_ID_MAP: Record<SupportedLanguage, number> = {
  python: 71,      // Python 3.8.1
  cpp: 54,         // C++ (GCC 9.2.0)
  java: 62,        // Java (OpenJDK 13.0.1)
  javascript: 63,  // JavaScript (Node.js 12.14.0)
};

export interface Judge0SubmissionPayload {
  source_code: string;
  language_id: number;
  stdin?: string;
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
  time?: string | null;    // runtime in seconds
  memory?: number | null;  // memory in KB
  status: Judge0Status;
}

export interface ExecutionResult {
  token: string;
  verdict: SubmissionVerdict;
  passed: boolean;
  runtime?: number; // converted to ms or kept in ms
  memory?: number;  // in KB
  stdout?: string;
  stderr?: string;
  compileOutput?: string;
}

class Judge0Service {
  private client: AxiosInstance;

  constructor() {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (JUDGE0_API_KEY) {
      headers['X-Auth-Token'] = JUDGE0_API_KEY;
    }

    this.client = axios.create({
      baseURL: JUDGE0_API_URL,
      headers,
      timeout: 10000,
    });
  }

  /**
   * Maps Judge0 status id to our MockKernel SubmissionVerdict
   * Status IDs:
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
      default:
        return 'INTERNAL_ERROR';
    }
  }

  /**
   * Submits code to Judge0 and returns the execution token
   */
  public async submitCode(payload: Judge0SubmissionPayload): Promise<string> {
    const response = await this.client.post<{ token: string }>(
      '/submissions?base64_encoded=false&wait=false',
      payload
    );

    if (!response.data?.token) {
      throw new Error('Judge0 did not return a submission token');
    }

    return response.data.token;
  }

  /**
   * Polls Judge0 until the submission reaches a finished status or exceeds max attempts
   */
  public async pollSubmission(token: string): Promise<Judge0Response> {
    let attempts = 0;

    while (attempts < MAX_POLL_ATTEMPTS) {
      attempts++;

      const response = await this.client.get<Judge0Response>(
        `/submissions/${token}?base64_encoded=false`
      );

      const data = response.data;
      const statusId = data.status?.id;

      // Status 1 = In Queue, 2 = Processing
      if (statusId !== 1 && statusId !== 2) {
        return data;
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new Error(`Judge0 polling timed out after ${MAX_POLL_ATTEMPTS} attempts for token ${token}`);
  }

  /**
   * Submits and polls execution for a single test case
   */
  public async executeTestCase(
    sourceCode: string,
    language: SupportedLanguage,
    stdin?: string,
    expectedOutput?: string,
    cpuTimeLimit?: number,
    memoryLimit?: number
  ): Promise<ExecutionResult> {
    const languageId = LANGUAGE_ID_MAP[language];
    if (!languageId) {
      throw new Error(`Unsupported language: ${language}`);
    }

    const payload: Judge0SubmissionPayload = {
      source_code: sourceCode,
      language_id: languageId,
      stdin: stdin || '',
      expected_output: expectedOutput || undefined,
      cpu_time_limit: cpuTimeLimit,
      memory_limit: memoryLimit,
    };

    const token = await this.submitCode(payload);
    const result = await this.pollSubmission(token);

    const verdict = this.mapStatusToVerdict(result.status.id);
    const passed = verdict === 'ACCEPTED';
    const runtimeMs = result.time ? Math.round(parseFloat(result.time) * 1000) : undefined;

    return {
      token,
      verdict,
      passed,
      runtime: runtimeMs,
      memory: result.memory || undefined,
      stdout: result.stdout || undefined,
      stderr: result.stderr || undefined,
      compileOutput: result.compile_output || undefined,
    };
  }
}

export const judge0Service = new Judge0Service();
