import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SubmissionVerdict, SupportedLanguage } from '../models/Submission.js';
import type { ExecutionResult } from './judge0.js';

export interface LocalRunnerOptions {
  defaultCpuTimeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

function normalizeOutput(output: string): string {
  return output
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trimEnd();
}

/**
 * Executes a single process with stdin and returns stdout, stderr, runtime and exit code.
 */
function runProcess(
  cmd: string,
  args: string[],
  cwd: string,
  stdin: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; runtimeMs: number }> {
  return new Promise((resolve) => {
    const startTime = process.hrtime.bigint();
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    let child: ChildProcess;
    try {
      child = spawn(cmd, args, {
        cwd,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return resolve({
        stdout: '',
        stderr: message,
        exitCode: 1,
        timedOut: false,
        runtimeMs: 0,
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {
        // Ignore kill errors
      }
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (stdout.length < 512 * 1024) {
        stdout += chunk.toString('utf8');
      }
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      if (stderr.length < 512 * 1024) {
        stderr += chunk.toString('utf8');
      }
    });

    child.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const endTime = process.hrtime.bigint();
      const runtimeMs = Math.round(Number(endTime - startTime) / 1_000_000);
      resolve({
        stdout,
        stderr: stderr || err.message,
        exitCode: 1,
        timedOut: false,
        runtimeMs,
      });
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const endTime = process.hrtime.bigint();
      const runtimeMs = Math.round(Number(endTime - startTime) / 1_000_000);
      resolve({
        stdout,
        stderr,
        exitCode: code,
        timedOut,
        runtimeMs,
      });
    });

    if (child.stdin) {
      try {
        child.stdin.write(stdin ?? '');
        child.stdin.end();
      } catch {
        // If child already closed, close silently
      }
    }
  });
}

/**
 * Local Code Execution Engine.
 * Replaces Judge0 with direct local execution using locally installed
 * runtimes (Node.js, Python 3, clang++/g++, javac/java).
 */
export class LocalRunnerService {
  private defaultTimeoutMs: number;

  constructor(options: LocalRunnerOptions = {}) {
    this.defaultTimeoutMs = options.defaultCpuTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  public async checkHealth(): Promise<{ ok: boolean; message?: string }> {
    return { ok: true, message: 'Local code execution engine active' };
  }

  public async executeTestCase(
    sourceCode: string,
    language: SupportedLanguage,
    stdin?: string,
    expectedOutput?: string,
    cpuTimeLimit?: number,
    _memoryLimit?: number
  ): Promise<ExecutionResult> {
    const token = `local-${randomUUID()}`;
    const timeoutMs = Math.min(
      Math.max((cpuTimeLimit ?? 5) * 1000, 1000),
      this.defaultTimeoutMs
    );

    const tempDir = mkdtempSync(join(tmpdir(), `mk-exec-${token}-`));

    try {
      switch (language) {
        case 'javascript': {
          const filePath = join(tempDir, 'solution.js');
          writeFileSync(filePath, sourceCode, 'utf8');

          const run = await runProcess('node', ['solution.js'], tempDir, stdin ?? '', timeoutMs);
          return this.evaluateResult(token, run, expectedOutput);
        }

        case 'python': {
          const filePath = join(tempDir, 'solution.py');
          writeFileSync(filePath, sourceCode, 'utf8');

          const run = await runProcess('python3', ['solution.py'], tempDir, stdin ?? '', timeoutMs);
          return this.evaluateResult(token, run, expectedOutput);
        }

        case 'cpp': {
          const srcPath = join(tempDir, 'solution.cpp');
          const binPath = join(tempDir, 'solution.out');
          writeFileSync(srcPath, sourceCode, 'utf8');

          // Compile C++
          const compile = await runProcess(
            'clang++',
            ['-O2', '-std=c++17', 'solution.cpp', '-o', 'solution.out'],
            tempDir,
            '',
            10_000
          );

          if (compile.exitCode !== 0) {
            return {
              token,
              verdict: 'COMPILE_ERROR',
              passed: false,
              compileOutput: compile.stderr || compile.stdout || 'Compilation failed',
            };
          }

          // Execute C++
          const run = await runProcess('./solution.out', [], tempDir, stdin ?? '', timeoutMs);
          return this.evaluateResult(token, run, expectedOutput);
        }

        case 'java': {
          // Detect class name or default to Solution
          const match = sourceCode.match(/public\s+class\s+([A-Za-z0-9_]+)/);
          const className = match ? match[1] : 'Solution';
          const srcPath = join(tempDir, `${className}.java`);
          writeFileSync(srcPath, sourceCode, 'utf8');

          // Compile Java
          const compile = await runProcess('javac', [`${className}.java`], tempDir, '', 10_000);
          if (compile.exitCode !== 0) {
            return {
              token,
              verdict: 'COMPILE_ERROR',
              passed: false,
              compileOutput: compile.stderr || compile.stdout || 'Java compilation failed',
            };
          }

          // Execute Java
          const run = await runProcess('java', [className], tempDir, stdin ?? '', timeoutMs);
          return this.evaluateResult(token, run, expectedOutput);
        }

        default:
          return {
            token,
            verdict: 'INTERNAL_ERROR',
            passed: false,
            stderr: `Unsupported language: ${language}`,
          };
      }
    } finally {
      try {
        rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  private evaluateResult(
    token: string,
    run: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; runtimeMs: number },
    expectedOutput?: string
  ): ExecutionResult {
    if (run.timedOut) {
      return {
        token,
        verdict: 'TLE',
        passed: false,
        runtime: run.runtimeMs,
        stderr: 'Time Limit Exceeded (execution exceeded allowed timeout guard)',
      };
    }

    if (run.exitCode !== 0) {
      return {
        token,
        verdict: 'RUNTIME_ERROR',
        passed: false,
        runtime: run.runtimeMs,
        stdout: run.stdout || undefined,
        stderr: run.stderr || `Process exited with code ${run.exitCode}`,
      };
    }

    const cleanStdout = normalizeOutput(run.stdout);
    const cleanExpected = expectedOutput !== undefined ? normalizeOutput(expectedOutput) : undefined;

    const passed = cleanExpected !== undefined ? cleanStdout === cleanExpected : true;
    const verdict: SubmissionVerdict = passed ? 'ACCEPTED' : 'WRONG_ANSWER';

    return {
      token,
      verdict,
      passed,
      runtime: run.runtimeMs,
      stdout: run.stdout,
      stderr: run.stderr || undefined,
    };
  }
}

let defaultLocalRunner: LocalRunnerService | null = null;

export function getLocalRunnerService(): LocalRunnerService {
  if (!defaultLocalRunner) {
    defaultLocalRunner = new LocalRunnerService();
  }
  return defaultLocalRunner;
}
