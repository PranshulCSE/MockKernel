export interface RetryOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null) {
    return undefined;
  }
  const err = error as { status?: unknown; statusCode?: unknown };
  if (typeof err.status === 'number') {
    return err.status;
  }
  if (typeof err.statusCode === 'number') {
    return err.statusCode;
  }
  return undefined;
}

export function isRetryableGroqError(error: unknown): boolean {
  const status = getErrorStatus(error);
  if (status !== undefined) {
    if (status === 429 || status >= 500) {
      return true;
    }
    if (status >= 400 && status < 500) {
      return false;
    }
  }

  if (typeof error === 'object' && error !== null) {
    const err = error as { name?: unknown; code?: unknown };
    if (
      err.name === 'APIConnectionTimeoutError' ||
      err.name === 'APIConnectionError' ||
      err.code === 'ETIMEDOUT' ||
      err.code === 'ECONNRESET'
    ) {
      return true;
    }
  }

  return false;
}

function parseRetryAfterMs(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const headers = (error as { headers?: unknown }).headers;
  if (!headers || typeof headers !== 'object') {
    return null;
  }

  let raw: unknown;
  if (typeof (headers as { get?: unknown }).get === 'function') {
    raw = (headers as { get: (name: string) => unknown }).get('retry-after');
  } else {
    raw = (headers as Record<string, unknown>)['retry-after'];
  }

  if (!raw) {
    return null;
  }
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds * 1000) : null;
}

/**
 * Executes an async operation with exponential backoff + jitter on 429 / 5xx / timeout errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 1000;
  const maxDelayMs = options.maxDelayMs ?? 10_000;
  const sleep = options.sleep ?? defaultSleep;

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries || !isRetryableGroqError(error)) {
        throw error;
      }

      const retryAfterMs = parseRetryAfterMs(error);
      const exponentialMs = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      const jitterMs = Math.floor(Math.random() * Math.min(250, exponentialMs * 0.2));
      const delayMs = retryAfterMs ?? Math.min(maxDelayMs, exponentialMs + jitterMs);

      attempt++;
      if (process.env.NODE_ENV !== 'test') {
        console.warn(
          `[GroqRetry] Attempt ${attempt}/${maxRetries} failed (status=${getErrorStatus(error) ?? 'network'}). Retrying in ${delayMs}ms...`
        );
      }
      await sleep(delayMs);
    }
  }
}
