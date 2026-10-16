import type { AppError, AppErrorCode } from '@/types';
import type { Result } from '@/utils';

import type { ServiceResult } from '../types';

/**
 * A conservative retry policy.
 *
 * Only failures that a second attempt could plausibly fix are retried: a
 * dropped connection, a timeout, and 5xx responses. Everything else — a
 * malformed request, an unsupported pair, a rejected credential, a malformed
 * response — will fail identically every time, so retrying only makes the user
 * wait longer for the same answer.
 *
 * `rate_limited` is deliberately NOT retried. Retrying into a rate limit is how
 * a soft limit becomes a hard ban; honouring it needs the server's backoff
 * hint, which is a deliberate design job rather than a default.
 */
const RETRYABLE: ReadonlySet<AppErrorCode> = new Set<AppErrorCode>([
  'network_unavailable',
  'timeout',
  'service_unavailable',
  'server_down',
]);

export function isRetryable(error: AppError): boolean {
  return RETRYABLE.has(error.code);
}

export type RetryPolicy = {
  /** Total attempts including the first. 1 disables retrying. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

/** Exponential backoff, capped. Attempt 1 waits `baseDelayMs`. */
export function backoffDelay(attempt: number, policy: RetryPolicy): number {
  const exponential = policy.baseDelayMs * 2 ** Math.max(0, attempt - 1);
  return Math.min(exponential, policy.maxDelayMs);
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export type RetryOptions = {
  policy: RetryPolicy;
  /** Overridable so tests do not spend real time sleeping. */
  sleep?: (ms: number) => Promise<void>;
  /** Overridable so a caller can widen or narrow what counts as transient. */
  shouldRetry?: (error: AppError) => boolean;
};

/**
 * Runs an operation, retrying only transient failures. Returns the last result,
 * so the caller sees the real error rather than a synthetic "gave up" one.
 */
export async function runWithRetry<T>(
  operation: (attempt: number) => ServiceResult<T>,
  options: RetryOptions,
): Promise<Result<T, AppError>> {
  const { policy } = options;
  const sleep = options.sleep ?? wait;
  const shouldRetry = options.shouldRetry ?? isRetryable;
  const attempts = Math.max(1, policy.maxAttempts);

  let last: Result<T, AppError> | undefined;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    last = await operation(attempt);
    if (last.ok) return last;
    if (attempt === attempts || !shouldRetry(last.error)) return last;
    await sleep(backoffDelay(attempt, policy));
  }

  // Unreachable: the loop always returns, but this keeps the type honest.
  return last ?? { ok: false, error: { code: 'unknown', message: 'Retry produced no result.' } };
}
