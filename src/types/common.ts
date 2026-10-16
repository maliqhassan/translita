/** Lifecycle of any async surface — screens branch on this, never on booleans. */
export type AsyncStatus = 'idle' | 'loading' | 'success' | 'error';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: AppError };

export type AppErrorCode =
  | 'network_unavailable'
  | 'timeout'
  | 'not_implemented'
  | 'service_unavailable'
  /**
   * Translita's own server answered with a failure (5xx), or something it
   * depends on did. Shown as maintenance, not as an error, so a user waits
   * rather than leaving.
   */
  | 'server_down'
  | 'rate_limited'
  | 'permission_denied'
  | 'invalid_request'
  /** A response arrived but did not match the shape we require. */
  | 'invalid_response'
  | 'unsupported_language'
  | 'model_missing'
  /**
   * The user's plan does not include what was asked for.
   *
   * Distinct from `permission_denied`, which is about an operating system
   * permission the user can grant, and from `service_unavailable`, which
   * invites a retry that would never succeed.
   */
  | 'entitlement_required'
  | 'storage_error'
  | 'cancelled'
  | 'unknown';

export type AppError = {
  code: AppErrorCode;
  message: string;
  cause?: unknown;
};

/** Progress for downloads / long tasks, expressed 0–1. */
export type Progress = {
  ratio: number;
  bytesWritten?: number;
  bytesTotal?: number;
};

export type Unsubscribe = () => void;
