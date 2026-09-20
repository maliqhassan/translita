import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TRANSLATION_CONFIG, hasBackendConfigured } from '@/constants/translation-config';
import {
  entitlementsFor,
  publishActiveEntitlements,
  resetActiveEntitlements,
} from '@/services/entitlements';
import {
  getActivePreferences,
  publishActivePreferences,
  resetActivePreferences,
} from '@/services/preferences/active-preferences';
import { services } from '@/services/service-registry';
import type { TranslationRequest } from '@/types';

/**
 * Exercises the real wiring, not a rebuilt copy of it: this is the object the
 * screens actually call.
 */

const request: TranslationRequest = {
  text: 'Hello',
  sourceLanguage: 'en',
  targetLanguage: 'de',
  origin: 'text',
};

describe('service registry', () => {
  it('refuses to translate rather than passing off a sample result', async () => {
    // Day 16. This build has no backend URL and, under Node, no native ML Kit
    // module, so nothing can serve the request. Before the fix the registry
    // swapped in the sample engine here and returned "Hallo" as though it were
    // a translation.
    const result = await services.translation.router.translate(request);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'service_unavailable');
  });

  it('never returns a sample result', async () => {
    const result = await services.translation.router.translate(request);
    assert.equal(result.ok && result.value.engine === 'mock', false);
  });

  it('does not cache a failure, so a later working build is not poisoned', async () => {
    const unique = `Hello ${Date.now()}`;
    const first = await services.translation.router.translate({ ...request, text: unique });
    const second = await services.translation.router.translate({ ...request, text: unique });

    assert.equal(first.ok, false);
    assert.equal(second.ok, false);
    assert.equal(await services.translation.cache.get({ ...request, text: unique }), undefined);
  });

  it('keeps the offline engine in routing even with no backend configured', async () => {
    // The defect Day 16 fixed: a missing EXPO_PUBLIC_TRANSEE_API_URL used to
    // replace the whole candidate list with the sample engine, so the offline
    // engine was never asked. Selecting on-device mode must now reach it, and
    // the honest model_missing is proof it did.
    //
    // Pro is published because the entitlement gate is live: it removes the
    // offline engine before availability is asked, so without this the request
    // would be refused earlier and this would stop testing what it is for.
    publishActivePreferences({ ...getActivePreferences(), translationMode: 'offline' });
    publishActiveEntitlements(entitlementsFor('pro', 'local'));

    try {
      const result = await services.translation.router.translate(request);

      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.error.code, 'model_missing');
    } finally {
      resetActivePreferences();
      resetActiveEntitlements();
    }
  });

  it('refuses a free user the offline engine in that same scenario', async () => {
    // The other half of the pair. Same build, same absent backend, same mode —
    // only the plan differs, and it is reported as the plan rather than as a
    // missing language pack the user could not have used anyway.
    publishActivePreferences({ ...getActivePreferences(), translationMode: 'offline' });
    publishActiveEntitlements(entitlementsFor('free', 'local'));

    try {
      const result = await services.translation.router.translate(request);

      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.error.code, 'entitlement_required');
    } finally {
      resetActivePreferences();
      resetActiveEntitlements();
    }
  });

  it('does not let the sample engine satisfy on-device mode', async () => {
    publishActivePreferences({ ...getActivePreferences(), translationMode: 'offline' });

    try {
      const result = await services.translation.router.translate(request);
      assert.equal(result.ok, false, 'a sample translation must not answer here');
    } finally {
      resetActivePreferences();
    }
  });

  it('does not let the sample engine satisfy online mode', async () => {
    publishActivePreferences({ ...getActivePreferences(), translationMode: 'online' });

    try {
      const result = await services.translation.router.translate(request);

      assert.equal(result.ok, false);
      assert.equal(!result.ok && result.error.code, 'service_unavailable');
    } finally {
      resetActivePreferences();
    }
  });

  it('rejects invalid input before reaching an engine', async () => {
    const result = await services.translation.router.translate({ ...request, text: '  ' });
    assert.equal(!result.ok && result.error.code, 'invalid_request');
  });

  it('reports the engine the UI would badge', async () => {
    // Nothing is available in this build, and resolveEngine falls back to the
    // engine the UI would otherwise have shown. What matters for Day 16 is that
    // it is no longer the sample engine.
    const badge = await services.translation.router.resolveEngine(request);
    assert.notEqual(badge, 'mock');
  });

  it('ships with no backend configured, so nothing calls a missing URL', async () => {
    assert.equal(hasBackendConfigured(), false);
    assert.equal(TRANSLATION_CONFIG.backend.baseUrl, undefined);
    assert.equal(await services.translation.online.isAvailable(), false);
  });

  it('carries no provider credential in client configuration', () => {
    const serialised = JSON.stringify(TRANSLATION_CONFIG).toLowerCase();
    for (const forbidden of ['apikey', 'api_key', 'secret', 'token', 'password', 'authorization']) {
      assert.ok(!serialised.includes(forbidden), `config must not contain "${forbidden}"`);
    }
  });

  it('exposes a cache that can be cleared', async () => {
    await services.translation.cache.clear();
    const fresh = await services.translation.cache.get({
      text: 'Hello',
      sourceLanguage: 'en',
      targetLanguage: 'de',
      origin: 'text',
    });
    assert.equal(fresh, undefined);
  });

  it('exposes connectivity as a service', async () => {
    const status = await services.network.getStatus();
    assert.ok(['online', 'offline', 'unknown'].includes(status));
  });
});
