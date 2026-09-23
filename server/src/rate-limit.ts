/**
 * A fixed-window, in-memory rate limiter.
 *
 * Deliberately small. It protects the provider quota from a runaway client on
 * a single instance, and nothing more. It is not a security control and does
 * not survive a restart or coordinate across instances — doing that properly
 * means shared state, and adding Redis today would be infrastructure we have
 * no use for yet. The boundary is here so that swap is one file when it is
 * genuinely needed.
 */

export type RateLimiter = {
  /** Records a hit and reports whether the caller may proceed. */
  check(clientKey: string): { allowed: boolean; retryAfterSeconds: number };
  /**
   * Drops expired windows.
   *
   * `check` already does this for itself once the map has grown, so the map
   * cannot leak unattended. This stays on the contract for a caller that wants
   * to reclaim on its own schedule, and for tests to drive deterministically.
   */
  sweep(now?: number): void;
  readonly size: number;
};

export type RateLimitOptions = {
  max: number;
  windowMs: number;
  now?: () => number;
};

type Window = { count: number; resetAt: number };

/**
 * How many tracked clients are tolerated before a check also clears expired
 * windows.
 *
 * A timer would be the obvious alternative and is worse here: it would have to
 * be created, unref'd so it cannot hold the process open, and torn down by
 * whoever built the limiter — lifecycle for something that only ever needs
 * doing when the map has actually grown. Sweeping from `check` costs nothing
 * on a quiet service and is O(n) only on the rare call that crosses the line.
 *
 * Sized well above any plausible number of simultaneous callers, so ordinary
 * traffic never pays for it.
 */
const SWEEP_ABOVE = 1_000;

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const windows = new Map<string, Window>();
  const now = options.now ?? (() => Date.now());

  const sweepExpired = (at: number) => {
    for (const [key, window] of windows) {
      if (at >= window.resetAt) windows.delete(key);
    }
  };

  return {
    check(clientKey: string) {
      const currentTime = now();
      const existing = windows.get(clientKey);

      // Every entry is one client address that may never be seen again, so
      // without this the map only ever grows. Done before the insert below, so
      // a sweep that frees room is reflected immediately.
      if (windows.size > SWEEP_ABOVE) sweepExpired(currentTime);

      if (!existing || currentTime >= existing.resetAt) {
        windows.set(clientKey, { count: 1, resetAt: currentTime + options.windowMs });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      existing.count += 1;
      if (existing.count > options.max) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - currentTime) / 1000)),
        };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },

    sweep(at = now()) {
      sweepExpired(at);
    },

    get size() {
      return windows.size;
    },
  };
}
