import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
  createPreferencesService,
  getActivePreferences,
  getActiveTranslationMode,
  parsePreferences,
  publishActivePreferences,
  resetActivePreferences,
  serializePreferences,
  type PreferencesStorage,
} from '@/services/preferences';
import {
  applySource,
  applySwap,
  applyTarget,
  canSwap,
  remember,
} from '@/store/language-pair-rules';
import type { LanguagePair, Preferences } from '@/types';
import { appError, err, ok } from '@/utils';

/** Day 7: preferences, their storage, and the rules that read them back. */

/** An in-memory storage slot: the same seam the file implementation fills. */
function memoryStorage(initial: string | null = null): PreferencesStorage & {
  contents: () => string | null;
} {
  let slot = initial;
  return {
    async read() {
      return ok(slot);
    },
    async write(contents: string) {
      slot = contents;
      return ok(undefined);
    },
    async remove() {
      slot = null;
      return ok(undefined);
    },
    contents: () => slot,
  };
}

/** Storage that fails every operation, as a full disk or denied path would. */
function failingStorage(): PreferencesStorage {
  const failure = () => err(appError('storage_error', 'nope'));
  return {
    async read() {
      return failure();
    },
    async write() {
      return failure();
    },
    async remove() {
      return failure();
    },
  };
}

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
};

describe('default preferences', () => {
  it('are the documented project defaults', () => {
    assert.deepEqual(DEFAULT_PREFERENCES, {
      sourceLanguage: 'en',
      targetLanguage: 'de',
      translationMode: 'auto',
      // Light rather than following the system: the design is built and
      // reviewed in light mode, so a first launch looks as designed.
      theme: 'light',
      saveHistory: true,
      // The engine's natural pace, and no voice chosen: an install that never
      // opens the speech settings speaks exactly as it did before they
      // existed. `voiceId` and `voiceLanguage` are deliberately absent rather
      // than undefined, so the stored file keeps the shape an older build
      // already copes with.
      speechRate: 1,
      // A fresh install has not been through the welcome screen yet. Installs
      // that predate the field are migrated to true instead of taking this.
      onboardingComplete: false,
    });
  });

  it('contain only serialisable primitives', () => {
    for (const [key, value] of Object.entries(DEFAULT_PREFERENCES)) {
      assert.ok(
        ['string', 'boolean', 'number'].includes(typeof value),
        `${key} must be a primitive, got ${typeof value}`,
      );
    }
  });

  it('serialise with a version stamp', () => {
    const parsed: unknown = JSON.parse(serializePreferences(DEFAULT_PREFERENCES));
    assert.equal((parsed as { version: number }).version, PREFERENCES_VERSION);
  });
});

describe('parsing stored preferences', () => {
  it('accepts a well-formed payload', () => {
    const stored: Preferences = {
      sourceLanguage: 'fr',
      targetLanguage: 'ja',
      translationMode: 'online',
      theme: 'dark',
      saveHistory: false,
      // A non-default rate, so this also proves the field survives parsing
      // rather than being quietly replaced by the default.
      speechRate: 1.25,
      onboardingComplete: true,
    };
    assert.deepEqual(parsePreferences({ version: 1, ...stored }), stored);
  });

  it('falls back to defaults for anything unreadable', () => {
    for (const payload of [null, undefined, 42, 'a string', [], true]) {
      assert.deepEqual(parsePreferences(payload), DEFAULT_PREFERENCES, JSON.stringify(payload));
    }
  });

  it('keeps the valid half of a partial payload', () => {
    const parsed = parsePreferences({ theme: 'dark' });
    assert.equal(parsed.theme, 'dark');
    assert.equal(parsed.sourceLanguage, DEFAULT_PREFERENCES.sourceLanguage);
    assert.equal(parsed.saveHistory, DEFAULT_PREFERENCES.saveHistory);
  });

  it('rejects a language the catalogue does not know', () => {
    const parsed = parsePreferences({ sourceLanguage: 'not-a-language', targetLanguage: 'xx' });
    assert.equal(parsed.sourceLanguage, DEFAULT_PREFERENCES.sourceLanguage);
    assert.equal(parsed.targetLanguage, DEFAULT_PREFERENCES.targetLanguage);
  });

  it('accepts catalogue variants', () => {
    const parsed = parsePreferences({ sourceLanguage: 'zh-Hant', targetLanguage: 'pt-BR' });
    assert.equal(parsed.sourceLanguage, 'zh-Hant');
    assert.equal(parsed.targetLanguage, 'pt-BR');
  });

  it('rejects an invalid translation mode', () => {
    for (const mode of ['turbo', '', 5, null]) {
      assert.equal(parsePreferences({ translationMode: mode }).translationMode, 'auto');
    }
  });

  it('rejects an invalid theme', () => {
    assert.equal(parsePreferences({ theme: 'neon' }).theme, DEFAULT_PREFERENCES.theme);
  });

  it('rejects a non-boolean saveHistory', () => {
    assert.equal(parsePreferences({ saveHistory: 'yes' }).saveHistory, true);
  });

  it('repairs a pair that is the same on both sides', () => {
    const parsed = parsePreferences({ sourceLanguage: 'fr', targetLanguage: 'fr' });
    assert.notEqual(parsed.sourceLanguage, parsed.targetLanguage);
  });

  it('repairs a collision even when it is the default target', () => {
    // Source is German, so the default target of German would collide too.
    const parsed = parsePreferences({ sourceLanguage: 'de', targetLanguage: 'de' });
    assert.equal(parsed.sourceLanguage, 'de');
    assert.notEqual(parsed.targetLanguage, 'de');
  });

  it('never accepts auto-detect as a target', () => {
    assert.notEqual(parsePreferences({ targetLanguage: 'auto' }).targetLanguage, 'auto');
  });

  it('accepts auto-detect as a source, which is how detection is expressed', () => {
    assert.equal(parsePreferences({ sourceLanguage: 'auto' }).sourceLanguage, 'auto');
  });

  it('ignores unknown fields from a newer build', () => {
    const parsed = parsePreferences({ theme: 'light', somethingNew: { nested: true } });
    assert.equal(parsed.theme, 'light');
    assert.equal(Object.keys(parsed).length, Object.keys(DEFAULT_PREFERENCES).length);
  });
});

describe('preferences service', () => {
  it('returns defaults when nothing has been stored', async () => {
    const service = createPreferencesService(memoryStorage());
    assert.deepEqual(await service.load(), DEFAULT_PREFERENCES);
  });

  it('round-trips a save and a load', async () => {
    const storage = memoryStorage();
    const service = createPreferencesService(storage);

    const saved: Preferences = {
      sourceLanguage: 'es',
      targetLanguage: 'fr',
      translationMode: 'online',
      theme: 'dark',
      saveHistory: false,
      speechRate: 0.5,
      onboardingComplete: true,
    };

    assert.equal((await service.save(saved)).ok, true);
    assert.deepEqual(await service.load(), saved);
  });

  it('survives a fresh service over the same storage', async () => {
    const storage = memoryStorage();
    await createPreferencesService(storage).save({
      ...DEFAULT_PREFERENCES,
      theme: 'dark',
      translationMode: 'online',
    });

    // A new service instance, as after a restart.
    const reopened = await createPreferencesService(storage).load();
    assert.equal(reopened.theme, 'dark');
    assert.equal(reopened.translationMode, 'online');
  });

  it('falls back to defaults when the stored text is not JSON', async () => {
    const service = createPreferencesService(memoryStorage('{ this is not json'));
    assert.deepEqual(await service.load(), DEFAULT_PREFERENCES);
  });

  it('falls back to defaults when the stored JSON is the wrong shape', async () => {
    const service = createPreferencesService(memoryStorage('["an","array"]'));
    assert.deepEqual(await service.load(), DEFAULT_PREFERENCES);
  });

  it('falls back to defaults when storage cannot be read at all', async () => {
    const service = createPreferencesService(failingStorage());
    assert.deepEqual(await service.load(), DEFAULT_PREFERENCES, 'a launch must never fail');
  });

  it('reports a failed save rather than pretending it worked', async () => {
    const service = createPreferencesService(failingStorage());
    const result = await service.save(DEFAULT_PREFERENCES);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'storage_error');
  });

  it('resets to defaults and persists them', async () => {
    const storage = memoryStorage();
    const service = createPreferencesService(storage);

    await service.save({ ...DEFAULT_PREFERENCES, theme: 'dark', saveHistory: false });
    const reset = unwrap(await service.reset());

    assert.deepEqual(reset, DEFAULT_PREFERENCES);
    assert.deepEqual(
      await service.load(),
      DEFAULT_PREFERENCES,
      'defaults were written, not just returned',
    );
  });

  it('never writes anything but primitives', async () => {
    const storage = memoryStorage();
    await createPreferencesService(storage).save(DEFAULT_PREFERENCES);

    const written = JSON.parse(storage.contents() ?? '{}') as Record<string, unknown>;
    for (const [key, value] of Object.entries(written)) {
      assert.ok(
        ['string', 'boolean', 'number'].includes(typeof value),
        `${key} must be a primitive`,
      );
    }
  });
});

describe('active preferences bridge', () => {
  it('publishes the mode the router reads', () => {
    resetActivePreferences();
    assert.equal(getActiveTranslationMode(), 'auto');

    publishActivePreferences({ ...DEFAULT_PREFERENCES, translationMode: 'offline' });
    assert.equal(getActiveTranslationMode(), 'offline');
    assert.equal(getActivePreferences().translationMode, 'offline');

    resetActivePreferences();
    assert.equal(getActiveTranslationMode(), 'auto');
  });
});

describe('language pair persistence', () => {
  /** Mirrors the store: apply the pure rule, persist exactly what it produced. */
  async function storeWith(initial: Preferences) {
    const storage = memoryStorage(serializePreferences(initial));
    const service = createPreferencesService(storage);
    let pair: LanguagePair = {
      source: initial.sourceLanguage,
      target: initial.targetLanguage,
    };

    const persist = async (next: LanguagePair) => {
      pair = next;
      await service.save({
        ...(await service.load()),
        sourceLanguage: next.source,
        targetLanguage: next.target,
      });
    };

    return {
      pair: () => pair,
      setSource: (id: string) => persist(applySource(pair, id)),
      setTarget: (id: string) => persist(applyTarget(pair, id)),
      swap: () => persist(applySwap(pair)),
      reload: () => service.load(),
    };
  }

  it('persists a source language choice', async () => {
    const store = await storeWith(DEFAULT_PREFERENCES);
    await store.setSource('fr');
    assert.equal((await store.reload()).sourceLanguage, 'fr');
  });

  it('persists a target language choice', async () => {
    const store = await storeWith(DEFAULT_PREFERENCES);
    await store.setTarget('ja');
    assert.equal((await store.reload()).targetLanguage, 'ja');
  });

  it('persists a swap', async () => {
    const store = await storeWith(DEFAULT_PREFERENCES);
    await store.swap();

    const reloaded = await store.reload();
    assert.equal(reloaded.sourceLanguage, 'de');
    assert.equal(reloaded.targetLanguage, 'en');
  });

  it('persists the swapped pair when the user picks the other side', async () => {
    const store = await storeWith(DEFAULT_PREFERENCES);
    // Choosing German as the source, when German is the target, swaps.
    await store.setSource('de');

    const reloaded = await store.reload();
    assert.equal(reloaded.sourceLanguage, 'de');
    assert.equal(reloaded.targetLanguage, 'en');
  });

  it('hydrates the stored pair on the next launch', async () => {
    const storage = memoryStorage(
      serializePreferences({ ...DEFAULT_PREFERENCES, sourceLanguage: 'ja', targetLanguage: 'ko' }),
    );
    const loaded = await createPreferencesService(storage).load();
    assert.deepEqual(
      { source: loaded.sourceLanguage, target: loaded.targetLanguage },
      {
        source: 'ja',
        target: 'ko',
      },
    );
  });

  it('leaves the Day 3 rules untouched', () => {
    // Persistence must not have changed how a pair transitions.
    assert.deepEqual(applySource({ source: 'en', target: 'de' }, 'de'), {
      source: 'de',
      target: 'en',
    });
    assert.deepEqual(applyTarget({ source: 'en', target: 'de' }, 'en'), {
      source: 'de',
      target: 'en',
    });
    assert.deepEqual(applySwap(applySwap({ source: 'en', target: 'de' })), {
      source: 'en',
      target: 'de',
    });
    assert.equal(canSwap({ source: 'auto', target: 'de' }), false);
    assert.deepEqual(remember(['de', 'fr'], 'de'), ['de', 'fr']);
  });
});
