import { appendFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const LOG_DIR = resolve(process.cwd(), 'logs');
const LOG_FILE = resolve(LOG_DIR, 'app.log');

let logDirEnsured = false;

async function ensureLogDir(): Promise<void> {
  if (logDirEnsured) return;
  try {
    if (!existsSync(LOG_DIR)) {
      await mkdir(LOG_DIR, { recursive: true });
    }
    logDirEnsured = true;
  } catch {
    // Best effort on directory creation
  }
}

export interface LogEntry {
  level: 'info' | 'warn' | 'error' | 'debug';
  timestamp?: string;
  message?: string;
  [key: string]: unknown;
}

export async function writeLog(entry: LogEntry): Promise<void> {
  try {
    await ensureLogDir();
    const formatted = {
      timestamp: entry.timestamp || new Date().toISOString(),
      ...entry,
    };
    await appendFile(LOG_FILE, JSON.stringify(formatted) + '\n', 'utf-8');
  } catch {
    // Non-blocking fallback for logging
  }
}

export const logger = {
  info: (message: string, meta: Record<string, unknown> = {}) => {
    const entry: LogEntry = { level: 'info', message, ...meta };
    console.log(JSON.stringify(entry));
    void writeLog(entry);
  },
  warn: (message: string, meta: Record<string, unknown> = {}) => {
    const entry: LogEntry = { level: 'warn', message, ...meta };
    console.warn(JSON.stringify(entry));
    void writeLog(entry);
  },
  error: (message: string, meta: Record<string, unknown> = {}) => {
    const entry: LogEntry = { level: 'error', message, ...meta };
    console.error(JSON.stringify(entry));
    void writeLog(entry);
  },
  debug: (message: string, meta: Record<string, unknown> = {}) => {
    if (process.env.NODE_ENV !== 'production') {
      const entry: LogEntry = { level: 'debug', message, ...meta };
      console.log(JSON.stringify(entry));
      void writeLog(entry);
    }
  },
};
