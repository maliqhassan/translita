import { appError, err, ok } from '@/utils';

import type { HttpClient } from '../http';
import type { Service, ServiceResult } from '../types';

/**
 * Waking the translation server before it is needed.
 *
 * The server sleeps after a spell with no requests, and the first request
 * after that waits while it starts — long enough that a user's first
 * translation of a visit could take ten seconds or time out. Asking for its
 * health endpoint when the app comes into view starts that wake-up early, so
 * it happens while the user is still typing.
 *
 * The request carries nothing about the user: no text, no identifier, no
 * body. It is a plain GET of a public health check.
 */
export type ServerWarmupService = Service & {
  /**
   * Asks the server to wake. Resolves true when it answered healthy, false
   * when there is no server to wake or it answered with an error status.
   * Never throws; a connection failure is an ordinary `Result` error.
   */
  warm(): ServiceResult<boolean>;
};

export type ServerWarmupOptions = {
  /** The backend's base URL. Undefined in a build without a backend. */
  baseUrl?: string;
  path: string;
  http: HttpClient;
  /**
   * Long on purpose. A server waking from sleep can take most of a minute to
   * answer, and the point is to keep the request open until it does — an
   * early timeout would be reported as a failure for a wake-up that worked.
   */
  timeoutMs: number;
};

export function createServerWarmupService(options: ServerWarmupOptions): ServerWarmupService {
  const configured = typeof options.baseUrl === 'string' && options.baseUrl.length > 0;
  const endpoint = () => `${(options.baseUrl ?? '').replace(/\/+$/, '')}${options.path}`;

  return {
    id: 'warmup.http',

    async isAvailable() {
      return configured;
    },

    async warm(): ServiceResult<boolean> {
      // No backend in this build: nothing to wake, and nothing has failed.
      if (!configured) return ok(false);

      const result = await options.http.send({
        url: endpoint(),
        method: 'GET',
        timeoutMs: options.timeoutMs,
      });

      if (!result.ok) {
        return err(appError(result.error.code, 'The server could not be reached to wake it.'));
      }
      return ok(result.value.ok);
    },
  };
}
