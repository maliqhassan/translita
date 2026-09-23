import type { TranslationRequest, TranslationResult } from '@/types';
import { createLogger, ok } from '@/utils';

import type { ServiceResult } from '../types';

import type { InFlightRegistry } from './in-flight-requests';
import type { TranslationCache } from './translation-cache';
import { normalizeTranslationRequest, translationCacheKey } from './translation-request';
import type { TranslationRouter } from './translation-service';

const log = createLogger('translation.cache');

export type CachingRouterOptions = {
  cache: TranslationCache;
  /** Collapses concurrent identical requests onto one call. */
  inFlight?: InFlightRegistry;
  /**
   * Whether an on-device result may still be handed back.
   *
   * The cache sits above the router, so a hit never reaches the routing policy
   * and would otherwise keep serving an on-device translation long after the
   * plan that earned it lapsed. Omitted means permitted.
   */
  offlineEntitled?: () => boolean;
};

/**
 * Wraps a router with caching and de-duplication.
 *
 * Kept as a decorator rather than folded into the router so each concern stays
 * separately testable, and so the cache applies to whichever engine ran — an
 * offline result is worth reusing as much as an online one.
 *
 * Only successes are cached. A failure is usually about the moment (no signal,
 * a timeout, a server restart) and caching it would make a recovered service
 * look broken.
 */
export function withCache(
  router: TranslationRouter,
  options: CachingRouterOptions,
): TranslationRouter {
  const { cache, inFlight } = options;

  /**
   * Whether a stored result is still the user's to receive.
   *
   * Only on-device results can go stale this way, and only by entitlement —
   * so nothing else is re-examined, and a refused entry is left in place
   * rather than evicted. Someone who resubscribes gets their cache back, and
   * the online entries sitting beside it were never in question.
   */
  const mayServe = (result: TranslationResult): boolean =>
    result.engine !== 'offline' || (options.offlineEntitled?.() ?? true);

  return {
    async translate(request: TranslationRequest): ServiceResult<TranslationResult> {
      const normalized = normalizeTranslationRequest(request);
      // Invalid requests are the router's to reject, with its wording.
      if (!normalized.ok) return router.translate(request);

      const cached = await cache.get(normalized.value);
      if (cached && mayServe(cached)) {
        log.debug('cache hit');
        return ok(cached);
      }

      const key = translationCacheKey(normalized.value);

      /**
       * Whether this call is the one that actually started the translation.
       *
       * `run` is invoked only for the originator; a joiner is handed the
       * promise already running. The assignment happens synchronously before
       * the first await, so it is settled long before the result arrives, and
       * each `translate` call has its own closure to record it in.
       */
      let originated = false;

      const run = async (): ServiceResult<TranslationResult> => {
        originated = true;
        const result = await router.translate(request);
        if (result.ok) await cache.set(normalized.value, result.value);
        return result;
      };

      const result = await (inFlight ? inFlight.run(key, run) : run());

      /*
       * A joiner is a new request, so it is gated like one.
       *
       * Sharing the in-flight promise used to hand a joiner the result without
       * passing `mayServe`, so a second request for identical text — made in
       * the moment between an on-device translation starting and settling —
       * could be served across a simultaneous loss of entitlement.
       *
       * The originator is deliberately exempt: its translation began while the
       * entitlement held, and Step 2C settled that such a request may finish
       * rather than being cancelled mid-flight. A joiner has no such claim.
       *
       * Refusal delegates to the router rather than inventing an error here,
       * so the wording stays the router's. That is not a second translation in
       * the case this exists for: with the engine no longer eligible, routing
       * refuses before any engine is asked whether it is available.
       */
      if (!originated && result.ok && !mayServe(result.value)) {
        return router.translate(request);
      }

      return result;
    },

    resolveEngine: (request) => router.resolveEngine(request),
  };
}
