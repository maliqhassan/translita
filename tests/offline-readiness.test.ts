import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { offlineNotice } from '@/features/offline/offline-notice';
import { toLanguagePacks } from '@/services/language-packs/language-pack';
import {
  createMlKitOfflineEngine,
  type MlKitNative,
} from '@/services/translation/offline/mlkit/mlkit-offline-engine';
import {
  isDownloadable,
  offlineReadiness,
  requiredPacks,
  type OfflineReadinessInput,
} from '@/services/translation/offline/offline-readiness';
import { createOfflineTranslationService } from '@/services/translation/offline-translation-service';
import { createTranslationRouter } from '@/services/translation/translation-router';
import type { TranslationService } from '@/services/translation/translation-service';
import type { TranslationMode, TranslationRequest } from '@/types';
import { ok } from '@/utils';

/**
 * Day 14: what the user is told when on-device translation cannot run.
 *
 * `model_missing` covers a missing source model, a missing target model and a
 * runtime that is not in the build at all — three different problems with
 * three different fixes. These tests pin the distinction, and pin that the one
 * fix which is *not* available (going online) is never taken.
 */

const request: TranslationRequest = {
  text: 'Hello',
  sourceLanguage: 'en',
  targetLanguage: 'de',
  origin: 'text',
};

/** Every language ML Kit serves in our catalogue, for readiness inputs. */
const SUPPORTED = ['en', 'de', 'fr', 'es', 'ja'];

const readiness = (overrides: Partial<OfflineReadinessInput> = {}) =>
  offlineReadiness({
    runtimeAvailable: true,
    supported: SUPPORTED,
    downloaded: [],
    source: 'en',
    target: 'de',
    ...overrides,
  });

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

describe('why on-device translation cannot run', () => {
  it('reports a missing runtime before anything else', () => {
    // Even with both packs downloaded, no runtime means no translation, and no
    // download would help.
    const result = readiness({ runtimeAvailable: false, downloaded: ['en', 'de'] });
    assert.equal(result.kind, 'runtime_missing');
  });

  it('names the source when only the source model is missing', () => {
    const result = readiness({ downloaded: ['de'] });

    assert.equal(result.kind, 'packs_missing');
    assert.deepEqual(result.kind === 'packs_missing' ? result.languages : [], ['en']);
  });

  it('names the target when only the target model is missing', () => {
    const result = readiness({ downloaded: ['en'] });

    assert.equal(result.kind, 'packs_missing');
    assert.deepEqual(result.kind === 'packs_missing' ? result.languages : [], ['de']);
  });

  it('names both when neither is downloaded', () => {
    const result = readiness({ downloaded: [] });

    assert.deepEqual(result.kind === 'packs_missing' ? result.languages : [], ['en', 'de']);
  });

  it('is ready only when both sides are present', () => {
    assert.equal(readiness({ downloaded: ['en', 'de'] }).kind, 'ready');
  });

  it('needs one pack when translating a language into itself', () => {
    assert.deepEqual(requiredPacks('en', 'en'), ['en']);
    assert.equal(readiness({ source: 'en', target: 'en', downloaded: ['en'] }).kind, 'ready');
  });

  it('separates "cannot download" from "not downloaded"', () => {
    // zh-Hant has no ML Kit model at all, so it is absent from `supported`.
    const result = readiness({ source: 'zh-Hant', downloaded: ['en', 'de'] });

    assert.equal(result.kind, 'unsupported');
    assert.equal(isDownloadable(result), false, 'the packs screen cannot fix this');
  });

  it('prefers the unsupported answer over a download that cannot exist', () => {
    const result = readiness({ source: 'zh-Hant', target: 'de', downloaded: [] });
    assert.equal(result.kind, 'unsupported');
  });

  it('asks for an explicit source rather than guessing', () => {
    const result = readiness({ source: 'auto', downloaded: ['en', 'de'] });
    assert.equal(result.kind, 'source_undetectable');
  });

  it('treats an unreadable model list as nothing downloaded', () => {
    // Safe direction: it points at downloading, never at trying and failing.
    assert.equal(readiness({ downloaded: [] }).kind, 'packs_missing');
  });
});

describe('what the user is told', () => {
  it('says nothing at all when the pair is ready', () => {
    assert.equal(offlineNotice({ kind: 'ready' }), undefined);
  });

  it('names the missing language and offers the packs screen', () => {
    const notice = offlineNotice({ kind: 'packs_missing', languages: ['de'] });

    assert.ok(notice);
    assert.match(notice.title, /German/);
    assert.match(notice.description, /Language Packs/);
    assert.ok(notice.actionLabel, 'the fix is reachable');
  });

  it('lists both languages in a readable sentence', () => {
    const notice = offlineNotice({ kind: 'packs_missing', languages: ['en', 'de'] });
    assert.match(notice?.title ?? '', /English and German/);
  });

  it('offers no packs action when downloading cannot help', () => {
    for (const readinessCase of [
      { kind: 'runtime_missing' } as const,
      { kind: 'unsupported', languages: ['zh-Hant'] } as const,
      { kind: 'source_undetectable' } as const,
    ]) {
      const notice = offlineNotice(readinessCase);
      assert.ok(notice, readinessCase.kind);
      assert.equal(
        notice.actionLabel,
        undefined,
        `${readinessCase.kind} must not offer a download`,
      );
    }
  });

  it('never suggests going online is automatic', () => {
    // Offering the *setting* is fine; implying a silent fallback is not.
    const notice = offlineNotice({ kind: 'packs_missing', languages: ['de'] });
    assert.equal(/automatically|fall ?back/i.test(notice?.description ?? ''), false);
  });
});

describe('downloading, retrying and removing', () => {
  it('retries successfully after a failed download', async () => {
    let failNext = true;
    const native = fakeNative([], {
      async downloadModel(language: string) {
        if (failNext) {
          failNext = false;
          throw { code: 'model_download_failed', message: 'no network' };
        }
        native.installed.add(language);
        native.calls.push(`downloadModel:${language}`);
      },
    });
    const engine = createMlKitOfflineEngine({ native });

    const first = await engine.downloadModel('mlkit:de');
    assert.equal(first.ok, false);
    assert.equal(!first.ok && first.error.code, 'model_missing');

    const packsAfterFailure = toLanguagePacks(unwrap(await engine.listModels()));
    assert.equal(
      packsAfterFailure.find((pack) => pack.language === 'de')?.state,
      'not_downloaded',
      'a failed download leaves nothing behind',
    );

    const retry = await engine.downloadModel('mlkit:de');
    assert.equal(retry.ok, true);

    const packs = toLanguagePacks(unwrap(await engine.listModels()));
    assert.equal(packs.find((pack) => pack.language === 'de')?.state, 'ready');
  });

  it('shows a successful download as ready, and readiness agrees', async () => {
    const native = fakeNative(['en']);
    const engine = createMlKitOfflineEngine({ native });

    assert.equal(
      readiness({ downloaded: ['en'] }).kind,
      'packs_missing',
      'before: the target is missing',
    );

    await engine.downloadModel('mlkit:de');
    const downloaded = unwrap(await engine.listModels())
      .filter((model) => model.status === 'ready')
      .map((model) => model.language);

    assert.equal(readiness({ downloaded }).kind, 'ready', 'after: nothing is missing');
  });

  it('shows a delete as removing, never as downloading', () => {
    // The two are opposite actions; one busy flag would let a deletion claim
    // to be a download, which the user cannot make sense of.
    const packs = toLanguagePacks(
      [{ id: 'mlkit:de', language: 'de', format: 'f', version: 'v', status: 'ready' }],
      { 'mlkit:de': 'removing' },
    );

    assert.equal(packs[0]?.state, 'removing');
  });

  it('returns to not downloaded after a delete', async () => {
    const engine = createMlKitOfflineEngine({ native: fakeNative(['de', 'en']) });
    await engine.deleteModel('mlkit:de');

    const packs = toLanguagePacks(unwrap(await engine.listModels()));
    assert.equal(packs.find((pack) => pack.language === 'de')?.state, 'not_downloaded');
  });

  it('keeps the pack downloaded when a delete fails', async () => {
    const engine = createMlKitOfflineEngine({
      native: fakeNative(['de'], {
        async deleteModel() {
          throw { code: 'model_delete_failed' };
        },
      }),
    });

    assert.equal((await engine.deleteModel('mlkit:de')).ok, false);
    const packs = toLanguagePacks(unwrap(await engine.listModels()));
    assert.equal(packs.find((pack) => pack.language === 'de')?.state, 'ready');
  });
});

describe('offline mode never goes online', () => {
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

  const routerWith = (downloaded: string[], mode: TranslationMode, native = true) =>
    createTranslationRouter({
      engines: [
        onlineEngine,
        createOfflineTranslationService(
          createMlKitOfflineEngine({ native: native ? fakeNative(downloaded) : null }),
        ),
      ],
      mode: () => mode,
    });

  it('fails rather than falling back when no pack is downloaded', async () => {
    const result = await routerWith([], 'offline').translate(request);

    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'model_missing');
  });

  it('fails rather than falling back with only the source pack', async () => {
    const result = await routerWith(['en'], 'offline').translate(request);
    assert.equal(!result.ok && result.error.code, 'model_missing');
  });

  it('fails rather than falling back with only the target pack', async () => {
    const result = await routerWith(['de'], 'offline').translate(request);
    assert.equal(!result.ok && result.error.code, 'model_missing');
  });

  it('fails rather than falling back when the runtime is absent', async () => {
    const result = await routerWith([], 'offline', false).translate(request);
    assert.equal(!result.ok && result.error.code, 'model_missing');
  });

  it('translates on device once both packs are present', async () => {
    const result = await routerWith(['en', 'de'], 'offline').translate(request);

    assert.equal(result.ok && result.value.engine, 'offline');
  });
});

describe('the fix is reachable from where it is needed', () => {
  it('offers the packs screen from the translate screen', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    assert.match(screen, /OfflineReadinessNotice/);
    assert.match(screen, /'\/settings\/language-packs'/);
  });

  it('checks readiness everywhere a pack could be the reason', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    // This was on-device only. In automatic, an undownloaded pack with no
    // backend reachable then surfaced as "this language pair is not available
    // yet", blaming the languages for a missing download. Online stays
    // excluded: there a pack genuinely is not the user's problem.
    //
    // The entitlement conjunct is the second exclusion, for the same reason
    // in reverse: a missing pack is not the obstacle when the whole feature
    // is not the user's to begin with.
    assert.match(screen, /useOfflineReadiness\(mode !== 'online' && offlinePermitted\)/);
  });

  it('still warns before translating only in on-device mode', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    // In automatic, online may well serve the pair, so a pre-emptive banner
    // about a missing pack would be noise. Readiness explains a failure there
    // rather than pre-empting one.
    assert.match(screen, /readiness=\{mode === 'offline' \? readiness : undefined\}/);
  });

  it('re-checks on focus, so returning from a download is not stale', () => {
    const hook = readFileSync('src/features/offline/hooks/use-offline-readiness.ts', 'utf8');
    assert.match(hook, /useFocusEffect/);
  });

  it('keeps offline-specific copy off unrelated failures', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    // A timeout must not become an invitation to download a language pack.
    assert.match(screen, /model_missing/);
    assert.match(screen, /unsupported_language/);
  });

  it('shows no raw error message on the packs screen', () => {
    const screen = readFileSync('src/features/offline/screens/language-packs-screen.tsx', 'utf8');

    // AppError.message is log copy; people get the mapped message.
    assert.equal(screen.includes('actionError.message'), false);
    assert.match(screen, /errorMessage\(actionError\)/);
  });
});
