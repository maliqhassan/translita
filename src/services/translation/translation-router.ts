import type {
  TranslationEngine,
  TranslationMode,
  TranslationRequest,
  TranslationResult,
} from '@/types';
import { appError, createLogger, err } from '@/utils';

import type { NetworkService, NetworkStatus } from '../network';
import type { ServiceResult } from '../types';

import { orderEngines } from './routing-policy';
import { normalizeTranslationRequest } from './translation-request';
import type { TranslationRouter, TranslationService } from './translation-service';

const log = createLogger('translation.router');

export type TranslationRouterOptions = {
  /** Candidates, in registry order. `orderEngines` re-ranks per request. */
  engines: readonly TranslationService[];
  /** Omitted in tests and dev builds; connectivity is then `unknown`. */
  network?: NetworkService;
  /**
   * The user's translation mode, read lazily so a settings change takes effect
   * on the very next request without rebuilding the router.
   */
  mode?: () => TranslationMode;
  /**
   * Whether the on-device engine may run, read lazily for the same reason the
   * mode is. Omitted means permitted.
   */
  offlineEntitled?: () => boolean;
};

/**
 * Chooses which engine serves a request, and is the only place that decision
 * is made. Screens and hooks call `translate` and never see an engine.
 *
 * Validation happens here rather than in each engine, so a request that could
 * never succeed fails immediately instead of after a network round trip.
 */
export function createTranslationRouter(options: TranslationRouterOptions): TranslationRouter {
  const { engines, network } = options;

  async function status(): Promise<NetworkStatus> {
    return network ? network.getStatus() : 'unknown';
  }

  /**
   * The chosen engine, plus whether anything was even available to choose.
   *
   * "No engine handles this pair" and "no engine is usable at all" are
   * different failures with different fixes, and only the second is what a
   * build with no backend and no native module is suffering from. Reporting
   * the pair as unsupported there would blame the languages for a
   * configuration problem.
   */
  async function pick(
    request: TranslationRequest,
    networkStatus: NetworkStatus,
  ): Promise<{ engine?: TranslationService; anyAvailable: boolean }> {
    const ordered = orderEngines(engines, {
      network: networkStatus,
      mode: options.mode?.() ?? 'auto',
      // Passed through rather than resolved here, so the policy stays the one
      // place an engine is ruled in or out.
      offlineEntitled: options.offlineEntitled,
    });

    let anyAvailable = false;

    for (const engine of ordered) {
      const [available, supportsPair] = await Promise.all([
        engine.isAvailable(),
        engine.supportsPair(request.sourceLanguage, request.targetLanguage),
      ]);
      if (available) anyAvailable = true;
      if (available && supportsPair) return { engine, anyAvailable: true };
    }

    return { anyAvailable };
  }

  /** What to tell the user when nothing can serve the request. */
  function unavailable(
    request: TranslationRequest,
    networkStatus: NetworkStatus,
    anyAvailable: boolean,
  ) {
    const mode = options.mode?.() ?? 'auto';
    const offlineEntitled = options.offlineEntitled?.() ?? true;

    /*
     * Checked before the missing-pack message below, which would otherwise be
     * a lie: telling someone to download a pack they are not allowed to use
     * sends them to a screen that cannot help them. The mode itself is left
     * alone — a lapsed subscriber's stored preference is theirs to keep, and
     * rewriting it would lose their choice if they resubscribe.
     */
    if (mode === 'offline' && !offlineEntitled) {
      return appError('entitlement_required', 'On-device translation is part of Transee Pro.');
    }

    // The user restricted routing themselves; say so plainly rather than
    // reporting a generic failure or quietly using the other engine.
    if (mode === 'offline') {
      return appError(
        'model_missing',
        'On-device translation is selected, but no language pack is installed yet.',
      );
    }

    if (mode === 'online' && networkStatus === 'offline') {
      return appError(
        'network_unavailable',
        'Online translation is selected, but there is no connection.',
      );
    }

    /*
     * No connection, and the on-device engine is not theirs to fall back to.
     *
     * Checked before the message below, which would otherwise blame the
     * language pair — "no on-device model covers en to de" — for something
     * that is nothing to do with the languages and cannot be fixed by
     * changing them. The obstacle is the plan, so say that.
     */
    if (networkStatus === 'offline' && !offlineEntitled) {
      return appError(
        'entitlement_required',
        'There is no connection, and translating without one is part of Transee Pro.',
      );
    }

    if (networkStatus === 'offline') {
      return appError(
        'network_unavailable',
        `Offline, and no on-device model covers ${request.sourceLanguage} to ${request.targetLanguage}.`,
      );
    }

    // Nothing was usable, so the pair was never the problem: this build has no
    // backend configured and no on-device runtime. Said as a service failure
    // rather than blaming the languages — and never papered over by handing the
    // request to a sample engine.
    if (!anyAvailable) {
      return appError('service_unavailable', 'No translation engine is available in this build.');
    }

    return appError(
      'unsupported_language',
      `No engine handles ${request.sourceLanguage} to ${request.targetLanguage}.`,
    );
  }

  return {
    async translate(request: TranslationRequest): ServiceResult<TranslationResult> {
      const normalized = normalizeTranslationRequest(request);
      if (!normalized.ok) return normalized;

      const networkStatus = await status();
      const { engine, anyAvailable } = await pick(request, networkStatus);

      if (!engine) {
        log.warn('no engine for request', {
          source: request.sourceLanguage,
          target: request.targetLanguage,
          network: networkStatus,
        });
        return err(unavailable(request, networkStatus, anyAvailable));
      }

      return engine.translate({ ...request, text: normalized.value.text });
    },

    async resolveEngine(request: TranslationRequest): Promise<TranslationEngine> {
      const { engine } = await pick(request, await status());
      // Nothing can serve the request; report the engine the UI would have used.
      return engine?.engine ?? 'online';
    },
  };
}
