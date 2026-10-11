import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { LANGUAGES } from '@/constants';
import {
  packsRequiredForPair,
  toLanguagePacks,
  toPackState,
  type LanguagePack,
} from '@/services/language-packs/language-pack';
import { isMlKitSupported } from '@/services/translation/offline/mlkit/mlkit-languages';
import {
  createMlKitOfflineEngine,
  type MlKitNative,
} from '@/services/translation/offline/mlkit/mlkit-offline-engine';
import type { OfflineTranslationEngine } from '@/services/translation/offline/offline-engine';
import { createOfflineTranslationService } from '@/services/translation/offline-translation-service';
import { createTranslationRouter } from '@/services/translation/translation-router';
import type { TranslationService } from '@/services/translation/translation-service';
import type { TranslationMode, TranslationRequest } from '@/types';
import { ok } from '@/utils';

/**
 * Day 13: the language packs screen, tested at the layer beneath the pixels.
 *
 * The screen itself is React Native and cannot render under Node, so what is
 * exercised here is everything the screen depends on: the pure mapping from
 * runtime models to packs, and the engine operations the buttons call. That is
 * where the rules worth protecting actually live — no invented sizes, no
 * unsupported language offered, and nothing downloading unless asked.
 */

const request: TranslationRequest = {
  text: 'Hello',
  sourceLanguage: 'en',
  targetLanguage: 'de',
  origin: 'text',
};

function fakeNative(
  downloaded: string[] = [],
  overrides: Partial<MlKitNative> = {},
): MlKitNative & { calls: string[]; installed: Set<string> } {
  const installed = new Set(downloaded);
  const calls: string[] = [];

  return {
    calls,
    installed,
    getSupportedLanguages: () => [],
    async getDownloadedLanguages() {
      calls.push('getDownloadedLanguages');
      return [...installed];
    },
    async downloadModel(language: string) {
      calls.push(`downloadModel:${language}`);
      installed.add(language);
    },
    async deleteModel(language: string) {
      calls.push(`deleteModel:${language}`);
      installed.delete(language);
    },
    async translate(source: string, target: string, text: string) {
      calls.push(`translate:${source}->${target}`);
      return `[${target}] ${text}`;
    },
    async closeAll() {
      calls.push('closeAll');
    },
    ...overrides,
  };
}

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
};

/** The packs a screen would render for a runtime in this state. */
async function packsFor(engine: OfflineTranslationEngine): Promise<LanguagePack[]> {
  return toLanguagePacks(unwrap(await engine.listModels()));
}

const find = (packs: readonly LanguagePack[], language: string) =>
  packs.find((pack) => pack.language === language);

describe('what the packs screen lists', () => {
  it('offers every language the runtime reports it can serve', async () => {
    const packs = await packsFor(createMlKitOfflineEngine({ native: fakeNative() }));

    assert.equal(packs.length, 55);
    assert.equal(find(packs, 'en')?.name, 'English');
    assert.equal(find(packs, 'de')?.name, 'German');
  });

  it('never offers a language the runtime cannot serve', async () => {
    const packs = await packsFor(createMlKitOfflineEngine({ native: fakeNative() }));

    // The variants ML Kit cannot express, and the two it simply lacks.
    for (const absent of ['zh-Hans', 'zh-Hant', 'pt-BR', 'pt-PT', 'sr', 'mn']) {
      assert.equal(find(packs, absent), undefined, `${absent} must not be downloadable`);
    }

    // And the general rule, rather than a hand-listed set.
    for (const pack of packs) {
      assert.ok(isMlKitSupported(pack.language), `${pack.language} is not an ML Kit language`);
    }
  });

  it('does not offer a language merely because the catalogue has it', async () => {
    const packs = await packsFor(createMlKitOfflineEngine({ native: fakeNative() }));

    assert.ok(LANGUAGES.length > packs.length, 'the catalogue is larger than what runs on device');
    assert.equal(LANGUAGES.length, 89);
  });

  it('shows a downloaded model as ready', async () => {
    const packs = await packsFor(createMlKitOfflineEngine({ native: fakeNative(['de', 'en']) }));

    assert.equal(find(packs, 'de')?.state, 'ready');
    assert.equal(find(packs, 'en')?.state, 'ready');
  });

  it('shows an absent model as not downloaded', async () => {
    const packs = await packsFor(createMlKitOfflineEngine({ native: fakeNative(['de']) }));

    assert.equal(find(packs, 'fr')?.state, 'not_downloaded');
    assert.equal(find(packs, 'es')?.state, 'not_downloaded');
  });

  it('lists nothing at all when the native module is absent', async () => {
    const packs = await packsFor(createMlKitOfflineEngine({ native: null }));
    assert.deepEqual(packs, []);
  });

  it('shows in-flight work without writing it into what the device has', async () => {
    const engine = createMlKitOfflineEngine({ native: fakeNative() });
    const models = unwrap(await engine.listModels());
    const overlaid = toLanguagePacks(models, { 'mlkit:de': 'downloading' });

    assert.equal(find(overlaid, 'de')?.state, 'downloading');
    // The runtime's own view is untouched: nothing claims the model is there.
    assert.equal(models.find((model) => model.language === 'de')?.status, 'not_installed');
  });

  it('reports a failed attempt as failed rather than as absent', async () => {
    const engine = createMlKitOfflineEngine({ native: fakeNative() });
    const packs = toLanguagePacks(unwrap(await engine.listModels()), { 'mlkit:de': 'failed' });

    assert.equal(find(packs, 'de')?.state, 'failed');
  });
});

describe('no invented numbers reach a screen', () => {
  it('carries no size field at all, not even an empty one', async () => {
    const packs = await packsFor(createMlKitOfflineEngine({ native: fakeNative(['de']) }));

    for (const pack of packs) {
      assert.equal('sizeBytes' in pack, false, 'a pack must have no size to render');
      assert.equal('approximateSizeMb' in pack, false);
      assert.equal('progress' in pack, false, 'ML Kit reports no progress');
    }
  });

  it('renders no byte formatting in the packs UI', () => {
    // ML Kit exposes no size, so the row must not have kept a formatter for one.
    const source = readFileSync('src/features/offline/components/language-pack-item.tsx', 'utf8');
    assert.equal(source.includes('formatBytes'), false);
    assert.equal(source.includes('sizeBytes'), false);
  });

  it('keeps the model itself free of a guessed size', async () => {
    const models = unwrap(
      await createMlKitOfflineEngine({ native: fakeNative(['de']) }).listModels(),
    );
    assert.ok(models.every((model) => model.sizeBytes === undefined));
    assert.ok(models.every((model) => model.checksum === undefined));
  });
});

describe('packs are languages, not pairs', () => {
  it('has one entry per language and none per direction', async () => {
    const packs = await packsFor(createMlKitOfflineEngine({ native: fakeNative(['en', 'de']) }));

    assert.equal(new Set(packs.map((pack) => pack.language)).size, packs.length);
    // A pair-shaped catalogue of 55 languages would be 55 * 54 entries.
    assert.equal(packs.length, 55);
    for (const pack of packs) {
      assert.equal(pack.modelId.includes('-'), false, 'a model id is not a pair id');
    }
  });

  it('derives both directions from the two language models', async () => {
    const engine = createMlKitOfflineEngine({ native: fakeNative(['en', 'de']) });
    const pairs = unwrap(await engine.getReadyPairs());

    assert.ok(pairs.some((pair) => pair.source === 'en' && pair.target === 'de'));
    assert.ok(pairs.some((pair) => pair.source === 'de' && pair.target === 'en'));
  });

  it('needs both sides, so one pack alone enables nothing', async () => {
    const engine = createMlKitOfflineEngine({ native: fakeNative(['en']) });
    assert.deepEqual(unwrap(await engine.getReadyPairs()), []);
  });

  it('names the two packs a pair requires', () => {
    assert.deepEqual(packsRequiredForPair('en', 'de'), ['en', 'de']);
    assert.deepEqual(packsRequiredForPair('en', 'en'), ['en']);
  });
});

describe('downloading a pack', () => {
  it('calls the runtime download operation for that language', async () => {
    const native = fakeNative();
    const engine = createMlKitOfflineEngine({ native });

    assert.equal((await engine.downloadModel('mlkit:de')).ok, true);
    assert.deepEqual(
      native.calls.filter((call) => call.startsWith('downloadModel')),
      ['downloadModel:de'],
    );
  });

  it('shows the pack as ready afterwards', async () => {
    const engine = createMlKitOfflineEngine({ native: fakeNative() });
    await engine.downloadModel('mlkit:de');

    assert.equal(find(await packsFor(engine), 'de')?.state, 'ready');
  });

  it('reports a failure instead of pretending it worked', async () => {
    const native = fakeNative([], {
      async downloadModel() {
        throw { code: 'model_download_failed', message: 'no network' };
      },
    });
    const engine = createMlKitOfflineEngine({ native });

    const result = await engine.downloadModel('mlkit:de');
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'model_missing');
    // And the pack is still absent, not optimistically marked ready.
    assert.equal(find(await packsFor(engine), 'de')?.state, 'not_downloaded');
  });

  it('never leaks a native message, which can carry user text', async () => {
    const native = fakeNative([], {
      async downloadModel() {
        throw { code: 'model_download_failed', message: 'secret user sentence' };
      },
    });
    const result = await createMlKitOfflineEngine({ native }).downloadModel('mlkit:de');

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.message.includes('secret user sentence'), false);
  });

  it('refuses a language the runtime cannot serve, without calling native', async () => {
    const native = fakeNative();
    const result = await createMlKitOfflineEngine({ native }).downloadModel('mlkit:zh-Hant');

    assert.equal(!result.ok && result.error.code, 'unsupported_language');
    assert.equal(native.calls.length, 0);
  });

  it('fails honestly when there is no native module to download with', async () => {
    const result = await createMlKitOfflineEngine({ native: null }).downloadModel('mlkit:de');
    assert.equal(result.ok, false);
  });
});

describe('removing a pack', () => {
  it('calls the runtime delete operation and frees the language', async () => {
    const native = fakeNative(['de']);
    const engine = createMlKitOfflineEngine({ native });

    assert.equal((await engine.deleteModel('mlkit:de')).ok, true);
    assert.ok(native.calls.includes('deleteModel:de'));
    assert.equal(find(await packsFor(engine), 'de')?.state, 'not_downloaded');
  });

  it('reports a failed removal rather than showing it gone', async () => {
    const native = fakeNative(['de'], {
      async deleteModel() {
        throw { code: 'model_delete_failed' };
      },
    });
    const engine = createMlKitOfflineEngine({ native });

    const result = await engine.deleteModel('mlkit:de');
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'storage_error');
    assert.equal(find(await packsFor(engine), 'de')?.state, 'ready', 'still on the device');
  });

  it('fails honestly when there is no native module to delete with', async () => {
    const result = await createMlKitOfflineEngine({ native: null }).deleteModel('mlkit:de');
    assert.equal(result.ok, false);
  });
});

describe('translating never downloads', () => {
  it('does not download a missing model on the translation path', async () => {
    const native = fakeNative();
    const engine = createMlKitOfflineEngine({ native });

    const result = await engine.translate(request);

    assert.equal(!result.ok && result.error.code, 'model_missing');
    assert.equal(
      native.calls.some((call) => call.startsWith('downloadModel')),
      false,
      'translation must never fetch a model',
    );
  });

  it('does not download when loading a model either', async () => {
    // `loadModel` sits on the translation path, so it carries the same rule.
    const native = fakeNative();
    const engine = createMlKitOfflineEngine({ native });

    const result = await engine.loadModel('mlkit:de');

    assert.equal(!result.ok && result.error.code, 'model_missing');
    assert.equal(
      native.calls.some((call) => call.startsWith('downloadModel')),
      false,
      'loading must never fetch a model',
    );
  });

  it('loads without complaint once the model is genuinely there', async () => {
    const native = fakeNative(['de']);
    const engine = createMlKitOfflineEngine({ native });

    assert.equal((await engine.loadModel('mlkit:de')).ok, true);
    assert.equal(
      native.calls.some((call) => call.startsWith('downloadModel')),
      false,
    );
  });

  it('leaves the model on disk when unloading', async () => {
    const native = fakeNative(['de']);
    const engine = createMlKitOfflineEngine({ native });

    assert.equal((await engine.unloadModel('mlkit:de')).ok, true);
    assert.equal(native.installed.has('de'), true, 'unloading is not deleting');
    assert.equal(find(await packsFor(engine), 'de')?.state, 'ready');
  });
});

describe('translation modes still behave', () => {
  const onlineEngine: TranslationService = {
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

  const routerWith = (downloaded: string[], mode: TranslationMode) =>
    createTranslationRouter({
      engines: [
        onlineEngine,
        createOfflineTranslationService(
          createMlKitOfflineEngine({ native: fakeNative(downloaded) }),
        ),
      ],
      mode: () => mode,
    });

  it('offline mode uses the on-device engine once both packs are downloaded', async () => {
    const result = await routerWith(['en', 'de'], 'offline').translate(request);

    assert.equal(result.ok && result.value.engine, 'offline');
    assert.equal(result.ok && result.value.translatedText, '[de] Hello');
  });

  it('offline mode returns model_missing rather than going online', async () => {
    const result = await routerWith([], 'offline').translate(request);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'model_missing');
  });

  it('offline mode still refuses the network with only one pack downloaded', async () => {
    const result = await routerWith(['en'], 'offline').translate(request);

    assert.equal(!result.ok && result.error.code, 'model_missing');
  });

  it('online mode keeps using the online engine even with packs downloaded', async () => {
    const result = await routerWith(['en', 'de'], 'online').translate(request);

    assert.equal(result.ok && result.value.engine, 'online');
  });

  it('auto mode still routes by the existing policy', async () => {
    const result = await routerWith(['en', 'de'], 'auto').translate(request);

    // Unchanged by Day 13: auto prefers the online engine when it is available.
    assert.equal(result.ok && result.value.engine, 'online');
  });
});

describe('lifecycle statuses collapse honestly', () => {
  it('treats anything installed as ready to use', () => {
    for (const status of ['installed', 'loading', 'ready', 'unloading'] as const) {
      assert.equal(toPackState(status), 'ready', status);
    }
  });

  it('keeps the states a user can act on distinct', () => {
    assert.equal(toPackState('not_installed'), 'not_downloaded');
    assert.equal(toPackState('downloading'), 'downloading');
    assert.equal(toPackState('error'), 'failed');
  });
});

describe('the screen is reachable', () => {
  it('has a route that only re-exports the screen', () => {
    const route = readFileSync('app/settings/language-packs.tsx', 'utf8');

    assert.match(route, /LanguagePacksScreen as default/);
    assert.match(route, /@\/features\/offline/);
    // Routes stay one-liners; business logic never lands in app/.
    assert.ok(route.trim().split('\n').length === 1, 'a route file is a single re-export');
  });

  it('is linked from the translation section of settings', () => {
    const settings = readFileSync('src/features/settings/screens/settings-screen.tsx', 'utf8');

    assert.match(settings, /'\/settings\/language-packs'/);
    assert.match(settings, /title=\{t\('Language packs'\)\}/);
  });

  it('is registered in the navigator', () => {
    const layout = readFileSync('app/_layout.tsx', 'utf8');
    assert.match(layout, /name="settings\/language-packs"/);
  });
});
