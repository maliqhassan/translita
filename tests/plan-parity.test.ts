import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, describe, it } from 'node:test';

import {
  CAPABILITIES,
  PLAN_CAPABILITIES,
  PRO_ONLY_CAPABILITIES,
  capabilitiesFor,
  entitlementsFor,
  publishActiveEntitlements,
  resetActiveEntitlements,
  resolveFeatureAccess,
  type Capability,
} from '@/services/entitlements';
import { withCache } from '@/services/translation/caching-router';
import { offlineTranslationPermitted } from '@/services/translation/offline-entitlement';
import { createMemoryTranslationCache } from '@/services/translation/translation-cache';
import type { TranslationRequest, TranslationResult } from '@/types';
import { ok } from '@/utils';

/**
 * The product decision, pinned in one place: Free and Pro are the same app.
 *
 * Everything below follows from a single rule — Pro is Free plus `adFree` —
 * but that rule is easy to break by accident from several directions, and
 * each of those directions costs a free user a feature they used to have. So
 * the consequences are asserted here rather than left to be inferred from the
 * table, and they are asserted per feature so a failure names what was lost.
 *
 * The narrower tests stay where they are: `entitlements.test.ts` owns the
 * table and the access rule, `engine-routing.test.ts` owns the routing gate,
 * and `entitlement-gates.test.ts` owns where a decision is allowed to live.
 * This file is about the product, not the mechanism.
 */

/**
 * What is sold. Neither is a translation feature.
 *
 * `adFree` removes advertising; `aiTutor` is unlimited practice with a model
 * that costs money on every exchange, and which everyone gets a free taste of.
 */
const SOLD: readonly Capability[] = ['adFree', 'aiTutor'];

/** Everything a user translates with, as opposed to what they pay for. */
const FEATURE_CAPABILITIES: readonly Capability[] = CAPABILITIES.filter(
  (capability) => !SOLD.includes(capability),
);

describe('the two plans differ over no translation feature at all', () => {
  it('gives every feature capability to both plans', () => {
    for (const capability of FEATURE_CAPABILITIES) {
      assert.equal(capabilitiesFor('free').has(capability), true, `free lost ${capability}`);
      assert.equal(capabilitiesFor('pro').has(capability), true, `pro lost ${capability}`);
    }
  });

  it('withholds exactly what is sold, and nothing else', () => {
    for (const capability of SOLD) {
      assert.equal(capabilitiesFor('free').has(capability), false, capability);
      assert.equal(capabilitiesFor('pro').has(capability), true, capability);
    }

    assert.deepEqual([...PRO_ONLY_CAPABILITIES].sort(), [...SOLD].sort());
  });

  it('leaves no feature capability in the Pro-only list', () => {
    for (const capability of PRO_ONLY_CAPABILITIES) {
      assert.equal(
        FEATURE_CAPABILITIES.includes(capability),
        false,
        `${capability} is a translation feature and must not be sold`,
      );
    }
  });

  it('derives Pro from Free, so the two cannot drift apart', () => {
    // Asserted against the source because the property is structural: the
    // table is written as an addition, not as two hand-kept lists.
    const table = readFileSync('src/services/entitlements/plan-capabilities.ts', 'utf8');

    assert.match(table, /free: FREE_CAPABILITIES/);
    assert.match(table, /pro: \[\.\.\.FREE_CAPABILITIES, 'adFree', 'aiTutor'\]/);
  });
});

describe('every feature gate answers the same on either plan', () => {
  it('is allowed on both plans wherever the device can do it', () => {
    for (const capability of FEATURE_CAPABILITIES) {
      for (const plan of ['free', 'pro'] as const) {
        assert.equal(
          resolveFeatureAccess({
            shipped: true,
            supported: true,
            entitled: capabilitiesFor(plan).has(capability),
          }),
          'allowed',
          `${capability} is not allowed on ${plan}`,
        );
      }
    }
  });

  it('never answers locked for a feature, on any plan or any device', () => {
    // `locked` is the answer that leads to the paywall. No feature can reach
    // it any more, because no feature is missing from either plan.
    for (const capability of FEATURE_CAPABILITIES) {
      for (const plan of ['free', 'pro'] as const) {
        for (const shipped of [true, false]) {
          for (const supported of [true, false]) {
            assert.notEqual(
              resolveFeatureAccess({
                shipped,
                supported,
                entitled: capabilitiesFor(plan).has(capability),
              }),
              'locked',
              `${capability} is locked on ${plan}`,
            );
          }
        }
      }
    }
  });

  it('still says unavailable when the device genuinely cannot do it', () => {
    /*
     * The half of the three-layer rule that making everything free must not
     * quietly undo.
     *
     * A phone with no text recogniser has to read as unavailable. Answering
     * `allowed` because the plan now permits it would be a worse bug than the
     * paywall ever was: the control would be offered, tapped, and fail.
     */
    for (const capability of FEATURE_CAPABILITIES) {
      for (const plan of ['free', 'pro'] as const) {
        const entitled = capabilitiesFor(plan).has(capability);

        assert.equal(
          resolveFeatureAccess({ shipped: true, supported: false, entitled }),
          'unavailable',
          `${capability} on ${plan} with no device support`,
        );
        assert.equal(
          resolveFeatureAccess({ shipped: false, supported: true, entitled }),
          'unavailable',
          `${capability} on ${plan} when not shipped`,
        );
      }
    }
  });
});

describe('a free user keeps on-device results the cache already holds', () => {
  afterEach(() => resetActiveEntitlements());

  const request: TranslationRequest = {
    text: 'Hello',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    origin: 'text',
  };

  const offlineResult: TranslationResult = {
    id: 'cached-1',
    sourceText: 'Hello',
    translatedText: 'Hallo',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    engine: 'offline',
    origin: 'text',
    createdAt: Date.now(),
  };

  /** Counts the times the cache had to fall through to a real translation. */
  function countingRouter() {
    let calls = 0;
    return {
      calls: () => calls,
      router: {
        async translate() {
          calls += 1;
          return ok(offlineResult);
        },
        async resolveEngine() {
          return 'offline' as const;
        },
      },
    };
  }

  it('serves a stored on-device translation rather than refusing it', async () => {
    /*
     * The cache sits above the routing policy, so its guard is a second place
     * the entitlement could have taken the feature away. It is wired to the
     * real `offlineTranslationPermitted`, not to a stub, so this fails if
     * either the flag or the table stops permitting a free user.
     */
    publishActiveEntitlements(entitlementsFor('free', 'local'));

    const { router, calls } = countingRouter();
    const cached = withCache(router, {
      cache: createMemoryTranslationCache({ maxEntries: 8 }),
      offlineEntitled: offlineTranslationPermitted,
    });

    const first = await cached.translate(request);
    assert.equal(first.ok && first.value.translatedText, 'Hallo');

    const second = await cached.translate(request);
    assert.equal(second.ok && second.value.translatedText, 'Hallo');
    assert.equal(second.ok && second.value.engine, 'offline');
    assert.equal(calls(), 1, 'the second call was served from the cache');
  });

  it('answers a free user exactly as it answers a paying one', async () => {
    const results = [];

    for (const plan of ['free', 'pro'] as const) {
      publishActiveEntitlements(entitlementsFor(plan, 'local'));

      const { router } = countingRouter();
      const cached = withCache(router, {
        cache: createMemoryTranslationCache({ maxEntries: 8 }),
        offlineEntitled: offlineTranslationPermitted,
      });

      const result = await cached.translate(request);
      results.push(result.ok ? result.value.engine : `error:${result.error.code}`);
    }

    assert.deepEqual(results, ['offline', 'offline']);
  });

  it('permits the on-device engine through the live rule, on a free plan', () => {
    publishActiveEntitlements(entitlementsFor('free', 'local'));

    assert.equal(offlineTranslationPermitted(), true);
  });
});

describe('nothing sells a feature any more', () => {
  it('leaves the plan-conditional copy unreachable rather than untrue', () => {
    /*
     * The locked-state strings — "part of Translita Pro" and the rest — are
     * still in the source, inside branches that need a missing capability to
     * render. Nothing has one, so nothing renders them.
     *
     * Asserted rather than deleted, because the claim being made here is
     * about reachability: if a later change puts a feature back behind Pro,
     * this passes and the copy is correct again; if it does not, the copy
     * cannot be seen. What must never happen is the copy being reachable
     * while the feature is free, and that is what the table above prevents.
     */
    for (const capability of FEATURE_CAPABILITIES) {
      assert.equal(
        PLAN_CAPABILITIES.free.includes(capability),
        true,
        `${capability} copy would become reachable`,
      );
    }
  });
});
