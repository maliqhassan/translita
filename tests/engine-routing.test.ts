import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { mockTranslationService } from '@/services/translation/mock-translation-service';
import {
  createMlKitOfflineEngine,
  type MlKitNative,
} from '@/services/translation/offline/mlkit/mlkit-offline-engine';
import { offlineTranslationPermittedFor } from '@/services/translation/offline-entitlement';
import { createOfflineTranslationService } from '@/services/translation/offline-translation-service';
import { orderEngines } from '@/services/translation/routing-policy';
import { createTranslationRouter } from '@/services/translation/translation-router';
import type { TranslationService } from '@/services/translation/translation-service';
import type { TranslationMode, TranslationRequest } from '@/types';
import { appError, err, ok } from '@/utils';

/**
 * Day 16: the sample engine can no longer answer for a real one.
 *
 * The defect had two halves, and both are pinned here. The registry replaced
 * the whole candidate list with the sample engine whenever no backend URL was
 * configured, so the on-device engine was never asked; and the routing policy
 * exempted the sample engine from mode filtering, so it could satisfy
 * "on-device only" even with real models installed.
 *
 * The scenario that matters most is the sample engine present *alongside* the
 * real ones. Tests that pass it alone cannot tell "correctly refused" from
 * "there was nothing else anyway".
 */

const request: TranslationRequest = {
  text: 'Hello',
  sourceLanguage: 'en',
  targetLanguage: 'de',
  origin: 'text',
};

function fakeNative(downloaded: string[] = []): MlKitNative {
  const installed = new Set(downloaded);
  return {
    getSupportedLanguages: () => [],
    async getDownloadedLanguages() {
      return [...installed];
    },
    async downloadModel(language: string) {
      installed.add(language);
    },
    async deleteModel(language: string) {
      installed.delete(language);
    },
    async translate(_source: string, target: string, text: string) {
      return `[${target}] ${text}`;
    },
    async closeAll() {},
  };
}

/** A backend-backed engine that works, for the online-mode cases. */
const workingOnline: TranslationService = {
  id: 'test.online',
  engine: 'online',
  isAvailable: async () => true,
  supportsPair: async () => true,
  translate: async () =>
    ok({
      id: 'online-1',
      sourceText: 'Hello',
      translatedText: 'from-online',
      sourceLanguage: 'en',
      targetLanguage: 'de',
      engine: 'online' as const,
      origin: 'text' as const,
      createdAt: 0,
    }),
  detectLanguage: async () => ok({ code: 'en', confidence: 1 }),
};

/** What `unconfiguredOnlineTranslationService` behaves like: present, unusable. */
const unconfiguredOnline: TranslationService = {
  id: 'test.online.unconfigured',
  engine: 'online',
  isAvailable: async () => false,
  supportsPair: async () => true,
  translate: async () => err(appError('service_unavailable', 'No backend is configured.')),
  detectLanguage: async () => err(appError('service_unavailable', 'No backend is configured.')),
};

const offlineWith = (downloaded: string[]) =>
  createOfflineTranslationService(createMlKitOfflineEngine({ native: fakeNative(downloaded) }));

/** The registry's real shape once the sample engine is explicitly enabled. */
const routerWith = (
  engines: readonly TranslationService[],
  mode: TranslationMode,
  network: 'online' | 'offline' = 'online',
  offlineEntitled?: () => boolean,
) =>
  createTranslationRouter({
    engines,
    mode: () => mode,
    offlineEntitled,
    network: {
      id: 'test.network',
      isAvailable: async () => true,
      getStatus: async () => network,
      subscribe: () => () => {},
    },
  });

describe('on-device mode reaches the on-device engine', () => {
  it('selects the offline engine when both models are present', async () => {
    const result = await routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de']), mockTranslationService],
      'offline',
    ).translate(request);

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.engine, 'offline');
    assert.equal(result.ok && result.value.translatedText, '[de] Hello');
  });

  it('returns model_missing when the models are absent', async () => {
    const result = await routerWith(
      [unconfiguredOnline, offlineWith([]), mockTranslationService],
      'offline',
    ).translate(request);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'model_missing');
  });

  it('never falls back to a working online engine', async () => {
    const result = await routerWith([workingOnline, offlineWith([])], 'offline').translate(request);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'model_missing');
  });

  it('never falls back to the sample engine, even when it is enabled', async () => {
    // The heart of the Day 16 defect: the sample engine was exempt from mode
    // filtering, so this returned "Hallo" badged Sample.
    const result = await routerWith(
      [workingOnline, offlineWith([]), mockTranslationService],
      'offline',
    ).translate(request);

    // Checked before the narrowing assertion below, so this genuinely reads
    // the result rather than a type-narrowed `never`.
    assert.equal(result.ok && result.value.engine === 'mock', false, 'no sample result here');
    assert.equal(result.ok, false);
  });

  it('is unaffected by there being no backend configured', async () => {
    // A missing EXPO_PUBLIC_TRANSEE_API_URL used to remove the offline engine
    // from the list entirely. Here the online engine is unusable and the
    // offline engine still answers.
    const result = await routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de'])],
      'offline',
    ).translate(request);

    assert.equal(result.ok && result.value.engine, 'offline');
  });
});

describe('online mode stays online or fails honestly', () => {
  it('uses the online engine when it is configured', async () => {
    const result = await routerWith(
      [workingOnline, offlineWith(['en', 'de']), mockTranslationService],
      'online',
    ).translate(request);

    assert.equal(result.ok && result.value.engine, 'online');
  });

  it('does not become a sample translation when the backend is unconfigured', async () => {
    const result = await routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de']), mockTranslationService],
      'online',
    ).translate(request);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'service_unavailable');
  });

  it('does not quietly use the on-device engine either', async () => {
    const result = await routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de'])],
      'online',
    ).translate(request);

    assert.equal(result.ok && result.value.engine === 'offline', false);
  });
});

describe('auto mode keeps the existing policy', () => {
  it('prefers the online engine when connected', async () => {
    const result = await routerWith(
      [workingOnline, offlineWith(['en', 'de'])],
      'auto',
      'online',
    ).translate(request);

    assert.equal(result.ok && result.value.engine, 'online');
  });

  it('prefers the on-device engine when there is no connection', async () => {
    const result = await routerWith(
      [workingOnline, offlineWith(['en', 'de'])],
      'auto',
      'offline',
    ).translate(request);

    assert.equal(result.ok && result.value.engine, 'offline');
  });

  it('still ranks the sample engine behind both real engines', () => {
    const ordered = orderEngines([mockTranslationService, workingOnline, offlineWith([])], {
      network: 'online',
      mode: 'auto',
    });

    assert.equal(ordered[ordered.length - 1]?.engine, 'mock');
  });

  it('reaches the sample engine only once no real engine can serve', async () => {
    const result = await routerWith(
      [unconfiguredOnline, offlineWith([]), mockTranslationService],
      'auto',
    ).translate(request);

    // Auto expresses no preference, so a clearly badged stand-in is acceptable
    // here and only here.
    assert.equal(result.ok && result.value.engine, 'mock');
  });
});

describe('the sample engine is opt-in only', () => {
  it('is admitted by the feature flag and nothing else', () => {
    const registry = readFileSync('src/services/service-registry.ts', 'utf8');

    // Both real engines are unconditional members of the candidate list.
    assert.match(registry, /const translationEngines[\s\S]{0,200}onlineTranslationService,/);
    assert.match(registry, /const translationEngines[\s\S]{0,200}offlineEngine,/);
    // The sample engine appears only behind the flag.
    assert.match(registry, /FEATURES\.mockTranslation \? \[mockTranslationService\] : \[\]/);
    // And the old backend-driven swap is gone.
    assert.equal(registry.includes('useSampleEngine'), false);
    assert.equal(registry.includes('hasBackendConfigured'), false);
  });

  it('is no longer exempt from mode filtering in the policy', () => {
    const policy = readFileSync('src/services/translation/routing-policy.ts', 'utf8');
    assert.equal(policy.includes("engine === 'mock' || mode === 'auto'"), false);
  });

  it('cannot satisfy any mode the user actually chose', async () => {
    for (const mode of ['online', 'offline'] as TranslationMode[]) {
      const result = await routerWith([mockTranslationService], mode).translate(request);
      assert.equal(result.ok, false, `${mode} must not be served by the sample engine`);
    }
  });

  it('is still available for development in auto mode', async () => {
    // Day 16 demotes the sample engine; it does not delete it.
    const result = await routerWith([mockTranslationService], 'auto').translate(request);

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.engine, 'mock');
  });
});

/**
 * Step 2C: the on-device engine is Pro-only, once enforcement is switched on.
 *
 * The gate lives in `isEligible`, which runs before an engine is asked whether
 * it is available and before it is asked whether it covers the pair. That
 * ordering is what makes installed packs, a lost connection and an unreachable
 * backend stop being ways in, so each of those is driven here as a whole
 * request rather than asserted about the policy in isolation.
 *
 * `FEATURES.offlineEntitlement` is not read by these tests. The flag decides
 * what the registry passes in; the getter is what routing acts on, and that is
 * what is exercised. The flag's own wiring is pinned separately below.
 */
const free = () => false;
const pro = () => true;

describe('offline routing is gated on the entitlement', () => {
  it('serves a free user online when a working backend is reachable', async () => {
    const result = await routerWith(
      [workingOnline, offlineWith(['en', 'de'])],
      'auto',
      'online',
      free,
    ).translate(request);

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.engine, 'online');
  });

  it('refuses a free user the on-device engine with no connection', async () => {
    // The named bypass: auto mode, offline network, both packs present. The
    // offline engine ranks first when there is no connection and would have
    // answered. Connectivity only reorders — it never drops an engine — so
    // with a working backend present the request is still served online, and
    // what matters is that it was not served on-device.
    const result = await routerWith(
      [workingOnline, offlineWith(['en', 'de'])],
      'auto',
      'offline',
      free,
    ).translate(request);

    assert.equal(result.ok && result.value.engine === 'offline', false);
    assert.equal(result.ok && result.value.engine, 'online');
  });

  it('gives a free user nothing at all when only the on-device engine could serve', async () => {
    // The same scenario with the backend unreachable, which is the shape the
    // bypass actually took: no connection, packs installed, nothing else able
    // to answer. It must fail rather than fall through.
    const result = await routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de'])],
      'auto',
      'offline',
      free,
    ).translate(request);

    assert.equal(result.ok, false);
  });

  it('refuses a free user the on-device engine when the backend is unconfigured', async () => {
    // The quieter bypass, and the one live today: nothing about the network is
    // wrong, the online engine simply reports itself unusable, and routing
    // used to fall straight through.
    const result = await routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de'])],
      'auto',
      'online',
      free,
    ).translate(request);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'service_unavailable');
  });

  it('refuses a free user who has on-device mode persisted from before', async () => {
    const result = await routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de'])],
      'offline',
      'online',
      free,
    ).translate(request);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'entitlement_required');
  });

  it('does not blame a missing language pack for a missing entitlement', () => {
    // Sending someone to download a pack they may not use is a dead end, so
    // the entitlement is reported before the pack ever is.
    const check = async () => {
      const result = await routerWith(
        [unconfiguredOnline, offlineWith([])],
        'offline',
        'offline',
        free,
      ).translate(request);

      assert.equal(!result.ok && result.error.code, 'entitlement_required');
    };

    return check();
  });

  it('refuses a free user even with every pack installed and no other engine', async () => {
    const result = await routerWith([offlineWith(['en', 'de'])], 'auto', 'offline', free).translate(
      request,
    );

    assert.equal(result.ok, false);
  });

  it('leaves a pro user exactly as they were', async () => {
    for (const mode of ['auto', 'offline'] as TranslationMode[]) {
      const result = await routerWith(
        [unconfiguredOnline, offlineWith(['en', 'de'])],
        mode,
        'offline',
        pro,
      ).translate(request);

      assert.equal(result.ok, true, mode);
      assert.equal(result.ok && result.value.engine, 'offline', mode);
      assert.equal(result.ok && result.value.translatedText, '[de] Hello', mode);
    }
  });

  it('behaves exactly as before when no entitlement getter is supplied', async () => {
    // This is the flag-off path: the registry passes a getter that answers
    // true, and every caller predating entitlements passes nothing at all.
    const result = await routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de'])],
      'auto',
      'offline',
    ).translate(request);

    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.engine, 'offline');
  });

  it('reports the engine the UI would badge, gated the same way', async () => {
    const engines = [unconfiguredOnline, offlineWith(['en', 'de'])];

    assert.equal(
      await routerWith(engines, 'auto', 'offline', pro).resolveEngine(request),
      'offline',
    );
    assert.notEqual(
      await routerWith(engines, 'auto', 'offline', free).resolveEngine(request),
      'offline',
    );
  });
});

describe('the entitlement is read per request, never captured', () => {
  it('changes answer on the next request when the plan changes', async () => {
    let entitled = true;
    // One router, built once, exactly as the registry builds it.
    const router = routerWith(
      [unconfiguredOnline, offlineWith(['en', 'de'])],
      'auto',
      'offline',
      () => entitled,
    );

    const asPro = await router.translate(request);
    assert.equal(asPro.ok && asPro.value.engine, 'offline');

    entitled = false;

    const asFree = await router.translate(request);
    assert.equal(asFree.ok, false, 'the next request must not reach the on-device engine');
  });

  it('asks again for every single request', async () => {
    let asked = 0;
    const router = routerWith([offlineWith(['en', 'de'])], 'auto', 'offline', () => {
      asked += 1;
      return true;
    });

    await router.translate(request);
    await router.translate(request);

    assert.ok(asked >= 2, `the getter must not be memoised (asked ${asked} times)`);
  });

  it('is excluded before availability or pair support is ever asked', async () => {
    // If the gate ran later, these would be called and the engine's own answer
    // would decide — which is precisely how installed packs became a bypass.
    let probed = 0;
    const watchful: TranslationService = {
      ...offlineWith(['en', 'de']),
      id: 'test.offline.watchful',
      engine: 'offline',
      isAvailable: async () => {
        probed += 1;
        return true;
      },
      supportsPair: async () => {
        probed += 1;
        return true;
      },
    };

    await routerWith([watchful], 'auto', 'offline', free).translate(request);

    assert.equal(probed, 0, 'the engine must never be consulted at all');
  });
});

describe('the offline entitlement rollout flag', () => {
  it('is on, so the gate above is live rather than dormant', () => {
    // This asserted `false` for the whole period the enforcement sat built but
    // switched off. Flipping it is what made every scenario in this file a
    // description of real behaviour instead of a rehearsal.
    const config = readFileSync('src/constants/config.ts', 'utf8');
    assert.match(config, /offlineEntitlement: true/);
  });

  it('denies an unentitled user through the shared rule', () => {
    // The flag and the capability are combined in one place; with the flag on,
    // the capability is the whole answer.
    assert.equal(offlineTranslationPermittedFor(false), false);
    assert.equal(offlineTranslationPermittedFor(true), true);
  });

  it('is what the single shared helper combines with the capability', () => {
    const helper = readFileSync('src/services/translation/offline-entitlement.ts', 'utf8');

    assert.match(helper, /if \(!FEATURES\.offlineEntitlement\) return true;/);
    assert.match(helper, /hasActiveCapability\('offlineTranslation'\)/);
  });

  it('is bound to both the router and the cache, from that one helper', () => {
    const registry = readFileSync('src/services/service-registry.ts', 'utf8');

    // Two bypasses, one answer: routing chooses the engine, the cache can hand
    // back what it already produced.
    assert.equal((registry.match(/offlineEntitled: offlineTranslationPermitted/g) ?? []).length, 2);
  });

  it('never filters the candidate list at import time', () => {
    const registry = readFileSync('src/services/service-registry.ts', 'utf8');
    const list = registry.slice(
      registry.indexOf('const translationEngines'),
      registry.indexOf('const translationCache'),
    );

    // A filter here would freeze the answer for the life of the process,
    // which is the stale state a lapsed subscription would exploit.
    assert.ok(list.length > 0);
    assert.equal(
      /offlineEntitled|hasActiveCapability|offlineTranslationPermitted/.test(list),
      false,
    );
    assert.match(list, /offlineEngine,/);
  });
});
