/**
 * Who may use the Academy's AI partner, and how much.
 *
 * Two questions, answered on the server because the app cannot be trusted to
 * answer them about itself:
 *
 * 1. Does this user have the Academy (the `elite` entitlement)? Asked of
 *    RevenueCat with the secret key, which never leaves the server, and
 *    remembered for a few minutes so every turn of a conversation does not
 *    become a RevenueCat request.
 * 2. Have they used today's allowance? A small one for everybody, so the
 *    free first day works; a much larger one with the Academy. Kept in
 *    memory, per UTC day: a restart forgets it, which costs at most one extra
 *    allowance and needs no database.
 *
 * The user id is RevenueCat's own app user id, sent by the app. It is not a
 * secret and could be guessed or copied; the allowance and the per-device
 * rate limit are what keep that from being worth anything.
 */

export type EntitlementChecker = {
  /** Whether RevenueCat is configured at all; without it nobody has the Academy. */
  readonly configured: boolean;
  hasAcademy(userId: string): Promise<boolean>;
};

export type RevenueCatCheckerOptions = {
  /** The secret API key. Absent means everyone gets the free allowance. */
  secretKey?: string;
  /** The entitlement that unlocks the Academy. */
  entitlement: string;
  /** How long an answer is trusted. */
  cacheMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

const REVENUECAT = 'https://api.revenuecat.com/v1/subscribers/';

export function createRevenueCatChecker(options: RevenueCatCheckerOptions): EntitlementChecker {
  const { secretKey, entitlement, cacheMs = 10 * 60_000, fetchImpl = fetch } = options;
  const now = options.now ?? (() => Date.now());
  const cache = new Map<string, { value: boolean; until: number }>();

  return {
    configured: Boolean(secretKey),

    async hasAcademy(userId) {
      if (!secretKey || !userId) return false;

      const cached = cache.get(userId);
      if (cached && cached.until > now()) return cached.value;

      let value = false;
      try {
        const response = await fetchImpl(REVENUECAT + encodeURIComponent(userId), {
          headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(8_000),
        });
        if (response.ok) {
          const body = (await response.json()) as {
            subscriber?: { entitlements?: Record<string, { expires_date?: string | null }> };
          };
          const granted = body.subscriber?.entitlements?.[entitlement];
          // No expiry is a lifetime grant; otherwise it must still be running.
          value = granted
            ? granted.expires_date == null || Date.parse(granted.expires_date) > now()
            : false;
        }
      } catch {
        // RevenueCat unreachable: treat as free for now, and do not remember
        // it, so the next turn asks again.
        return false;
      }

      cache.set(userId, { value, until: now() + cacheMs });
      // Bounded, so a flood of made-up ids cannot grow it forever.
      if (cache.size > 10_000) {
        for (const [key, entry] of cache) if (entry.until <= now()) cache.delete(key);
      }
      return value;
    },
  };
}

export type DailyAllowance = {
  /** Uses one turn, and reports whether it was available. */
  take(key: string, withAcademy: boolean): boolean;
};

export type DailyAllowanceOptions = {
  /** Turns a day without the Academy. */
  free: number;
  /** Turns a day with it. */
  academy: number;
  now?: () => number;
};

export function createDailyAllowance(options: DailyAllowanceOptions): DailyAllowance {
  const now = options.now ?? (() => Date.now());
  let day = '';
  let used = new Map<string, number>();

  return {
    take(key, withAcademy) {
      // A new UTC day starts everyone again, and drops yesterday's counts.
      const today = new Date(now()).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        used = new Map();
      }
      const limit = withAcademy ? options.academy : options.free;
      const count = used.get(key) ?? 0;
      if (count >= limit) return false;
      used.set(key, count + 1);
      return true;
    },
  };
}
