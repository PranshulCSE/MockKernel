import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 2358;

interface SubmissionResult {
  token: string;
  status: { id: number; description: string };
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null;
  memory: number | null;
}

const memoryStore = new Map<string, SubmissionResult>();

function normalize(s: string): string {
  return s.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trimEnd();
}

function runProc(
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
      child = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      return resolve({
        stdout: '',
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: 1,
        timedOut: false,
        runtimeMs: 0,
      });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill('SIGKILL');
      } catch {}
    }, timeoutMs);

    child.stdout?.on('data', (d: Buffer) => {
      if (stdout.length < 512 * 1024) stdout += d.toString('utf8');
    });
    child.stderr?.on('data', (d: Buffer) => {
      if (stderr.length < 512 * 1024) stderr += d.toString('utf8');
    });

    child.on('error', (err: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const runtimeMs = Math.round(Number(process.hrtime.bigint() - startTime) / 1_000_000);
      resolve({ stdout, stderr: stderr || err.message, exitCode: 1, timedOut: false, runtimeMs });
    });

    child.on('close', (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const runtimeMs = Math.round(Number(process.hrtime.bigint() - startTime) / 1_000_000);
      resolve({ stdout, stderr, exitCode: code, timedOut, runtimeMs });
    });

    if (child.stdin) {
      try {
        child.stdin.write(stdin ?? '');
        child.stdin.end();
      } catch {}
    }
  });
}

async function executeLocally(
  sourceCode: string,
  languageId: number,
  stdin: string,
  expectedOutput?: string,
  timeoutMs = 5000
): Promise<SubmissionResult> {
  const token = randomUUID();
  const tempDir = mkdtempSync(join(tmpdir(), `judge-mock-${token}-`));

  try {
    // 71: Python 3, 63: JS (Node), 54: C++, 62: Java
    if (languageId === 71) {
      const file = join(tempDir, 'main.py');
      writeFileSync(file, sourceCode, 'utf8');
      const run = await runProc('python3', ['main.py'], tempDir, stdin, timeoutMs);
      return evaluate(token, run, expectedOutput);
    } else if (languageId === 63) {
      const file = join(tempDir, 'main.js');
      writeFileSync(file, sourceCode, 'utf8');
      const run = await runProc('node', ['main.js'], tempDir, stdin, timeoutMs);
      return evaluate(token, run, expectedOutput);
    } else if (languageId === 54) {
      const src = join(tempDir, 'main.cpp');
      writeFileSync(src, sourceCode, 'utf8');
      const comp = await runProc('clang++', ['-O2', '-std=c++17', 'main.cpp', '-o', 'main.out'], tempDir, '', 10000);
      if (comp.exitCode !== 0) {
        return {
          token,
          status: { id: 6, description: 'Compilation Error' },
          stdout: null,
          stderr: null,
          compile_output: comp.stderr || comp.stdout || 'Compile error',
          time: null,
          memory: null,
        };
      }
      const run = await runProc('./main.out', [], tempDir, stdin, timeoutMs);
      return evaluate(token, run, expectedOutput);
    } else if (languageId === 62) {
      const match = sourceCode.match(/public\s+class\s+([A-Za-z0-9_]+)/);
      const cls = match ? match[1] : 'Solution';
      writeFileSync(join(tempDir, `${cls}.java`), sourceCode, 'utf8');
      const comp = await runProc('javac', [`${cls}.java`], tempDir, '', 10000);
      if (comp.exitCode !== 0) {
        return {
          token,
          status: { id: 6, description: 'Compilation Error' },
          stdout: null,
          stderr: null,
          compile_output: comp.stderr || comp.stdout || 'Java compile error',
          time: null,
          memory: null,
        };
      }
      const run = await runProc('java', [cls], tempDir, stdin, timeoutMs);
      return evaluate(token, run, expectedOutput);
    } else {
      return {
        token,
        status: { id: 13, description: 'Internal Error: unsupported language' },
        stdout: null,
        stderr: `Unsupported language id ${languageId}`,
        compile_output: null,
        time: null,
        memory: null,
      };
    }
  } finally {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
}

function evaluate(
  token: string,
  run: { stdout: string; stderr: string; exitCode: number | null; timedOut: boolean; runtimeMs: number },
  expected?: string
): SubmissionResult {
  const timeStr = (run.runtimeMs / 1000).toFixed(3);

  if (run.timedOut) {
    return {
      token,
      status: { id: 5, description: 'Time Limit Exceeded' },
      stdout: run.stdout || null,
      stderr: 'Time Limit Exceeded',
      compile_output: null,
      time: timeStr,
      memory: null,
    };
  }

  if (run.exitCode !== 0) {
    return {
      token,
      status: { id: 11, description: 'Runtime Error (NZEC)' },
      stdout: run.stdout || null,
      stderr: run.stderr || `Exit code ${run.exitCode}`,
      compile_output: null,
      time: timeStr,
      memory: null,
    };
  }

  const cleanOut = normalize(run.stdout);
  const cleanExp = expected !== undefined ? normalize(expected) : undefined;
  const passed = cleanExp !== undefined ? cleanOut === cleanExp : true;

  return {
    token,
    status: passed ? { id: 3, description: 'Accepted' } : { id: 4, description: 'Wrong Answer' },
    stdout: run.stdout || null,
    stderr: run.stderr || null,
    compile_output: null,
    time: timeStr,
    memory: null,
  };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);

  if (req.method === 'GET' && url.pathname === '/about') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ version: '1.13.0-local-mock', status: 'ready' }));
  }

  if (req.method === 'POST' && url.pathname.startsWith('/submissions')) {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body);
        const { source_code, language_id, stdin = '', expected_output, cpu_time_limit } = payload;
        const timeoutMs = Math.min(Math.max((cpu_time_limit ?? 5) * 1000, 1000), 10000);

        const result = await executeLocally(source_code, language_id, stdin, expected_output, timeoutMs);
        memoryStore.set(result.token, result);

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ token: result.token }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }

  if (req.method === 'GET' && url.pathname.startsWith('/submissions/')) {
    const token = url.pathname.split('/')[2];
    const item = memoryStore.get(token);
    if (!item) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ error: 'Token not found' }));
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify(item));
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`[LocalJudge0] Listening on http://localhost:${PORT} (Zero-Docker Native Runner)`);
});
