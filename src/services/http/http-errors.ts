import type { AppError } from '@/types';
import { appError } from '@/utils';

/**
 * Turns transport failures and HTTP status codes into the app's own errors.
 *
 * Everything a user could ever see comes from `AppErrorCode`; the raw cause is
 * kept on the error for logs but never rendered. This is the only place that
 * knows what an HTTP status means.
 */

/** True when the thrown value looks like an abort rather than a failure. */
export function isAbortError(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'name' in cause &&
    (cause as { name?: unknown }).name === 'AbortError'
  );
}

/** A request that never completed: DNS failure, refused connection, no radio. */
export function networkError(cause?: unknown): AppError {
  return appError('network_unavailable', 'The request could not reach the server.', cause);
}

export function timeoutError(timeoutMs: number, cause?: unknown): AppError {
  return appError('timeout', `The request did not answer within ${timeoutMs}ms.`, cause);
}

/**
 * Maps a completed response's status onto an error code.
 *
 * 408 and 429 are separated from the rest of the 4xx range because they are the
 * two client-side statuses that describe a *temporary* condition.
 */
export function httpStatusError(status: number, cause?: unknown): AppError {
  if (status === 408) return appError('timeout', 'The server reported a request timeout.', cause);
  if (status === 429)
    return appError('rate_limited', 'The server is rate limiting requests.', cause);
  if (status === 401 || status === 403) {
    return appError('permission_denied', `The server rejected the request (${status}).`, cause);
  }
  if (status === 422) {
    return appError('unsupported_language', 'The server cannot handle that language pair.', cause);
  }
  if (status >= 400 && status < 500) {
    return appError('invalid_request', `The server rejected the request (${status}).`, cause);
  }
  if (status >= 500) {
    return appError('server_down', `The server failed to respond (${status}).`, cause);
  }
  return appError('unknown', `Unexpected response status ${status}.`, cause);
}

/** A response arrived but did not carry the fields the app requires. */
export function invalidResponseError(detail: string, cause?: unknown): AppError {
  return appError('invalid_response', detail, cause);
}
