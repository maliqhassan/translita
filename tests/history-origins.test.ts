import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createHistoryRepository } from '@/database';
import { translateAndRecord } from '@/features/translation/record-translation';
import {
  createMlKitOfflineEngine,
  type MlKitNative,
} from '@/services/translation/offline/mlkit/mlkit-offline-engine';
import { createOfflineTranslationService } from '@/services/translation/offline-translation-service';
import { createTranslationRouter } from '@/services/translation/translation-router';
import type { TranslationService } from '@/services/translation/translation-service';
import type { TranslationRequest, TranslationSource } from '@/types';
import { ok } from '@/utils';

import { createNodeSQLiteDatabase } from './support/node-sqlite-database';

/**
 * Day 19: history keeps *how* a translation was made, not just what it said.
 *
 * The `origin` column, the `TranslationSource` union and the per-origin icon
 * in the history list all existed from Day 1 and Day 6. What was missing was a
 * producer: the translate screen hard-coded `origin: 'text'`, so a dictated or
 * scanned translation was filed as typed and every row drew the same icon.
 *
 * These tests pin the column end to end, and pin the engine and mode coverage
 * the audit checked but nothing asserted.
 */

const request: TranslationRequest = {
  text: 'Hello',
  sourceLanguage: 'en',
  targetLanguage: 'de',
  origin: 'text',
};

/** Settles the un-awaited history write. */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function repository() {
  const repo = createHistoryRepository(createNodeSQLiteDatabase());
  const started = await repo.initialize();
  assert.equal(started.ok, true);
  return repo;
}

/**
 * A fresh id per result, because the ordering below depends on one.
 *
 * `listRecent` orders by `created_at DESC, id DESC`. Several translations made
 * in the same millisecond share a timestamp, so the id is the tiebreaker that
 * makes the order deterministic — and a fixture returning one constant id for
 * every row removed it, leaving rows tied on *both* keys and ordered however
 * SQLite happened to return them. Production never had this problem:
 * `createId` is unique per call.
 */
let nextResultId = 0;

const onlineEngine: TranslationService = {
  id: 'test.online',
  engine: 'online',
  isAvailable: async () => true,
  supportsPair: async () => true,
  translate: async (r) =>
    ok({
      id: `online-${(nextResultId += 1)}`,
      sourceText: r.text,
      translatedText: 'from-online',
      sourceLanguage: r.sourceLanguage,
      targetLanguage: r.targetLanguage,
      engine: 'online' as const,
      origin: r.origin,
      createdAt: Date.now(),
    }),
  detectLanguage: async () => ok({ code: 'en', confidence: 1 }),
};

function fakeNative(downloaded: string[]): MlKitNative {
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

describe('history records how the text arrived', () => {
  const origins: TranslationSource[] = ['text', 'voice', 'camera', 'clipboard'];

  for (const origin of origins) {
    it(`stores and returns origin "${origin}"`, async () => {
      const repo = await repository();
      const router = createTranslationRouter({ engines: [onlineEngine] });

      await translateAndRecord(router, repo, { ...request, origin });
      await flush();

      const entries = await repo.listRecent({ limit: 5 });
      assert.equal(entries.ok, true);
      assert.equal(entries.ok && entries.value[0]?.origin, origin);
    });
  }

  it('keeps each origin distinct across several translations', async () => {
    const repo = await repository();
    const router = createTranslationRouter({ engines: [onlineEngine] });

    for (const origin of origins) {
      await translateAndRecord(router, repo, { ...request, text: `Hello ${origin}`, origin });
      await flush();
    }

    const entries = await repo.listRecent({ limit: 10 });
    assert.equal(entries.ok, true);
    if (!entries.ok) return;

    // Newest first, so the insert order is reversed.
    assert.deepEqual(
      entries.value.map((entry) => entry.origin),
      [...origins].reverse(),
    );
  });

  it('survives a reopen, because the origin is a column and not derived', async () => {
    const database = createNodeSQLiteDatabase();
    const repo = createHistoryRepository(database);
    await repo.initialize();

    const router = createTranslationRouter({ engines: [onlineEngine] });
    await translateAndRecord(router, repo, { ...request, origin: 'camera' });
    await flush();

    const reopened = createHistoryRepository(database);
    await reopened.initialize();

    const entries = await reopened.listRecent({ limit: 1 });
    assert.equal(entries.ok && entries.value[0]?.origin, 'camera');
  });
});

describe('history records which engine answered', () => {
  it('files an online translation as online', async () => {
    const repo = await repository();
    const router = createTranslationRouter({ engines: [onlineEngine], mode: () => 'online' });

    await translateAndRecord(router, repo, request);
    await flush();

    const entries = await repo.listRecent({ limit: 1 });
    assert.equal(entries.ok && entries.value[0]?.engine, 'online');
  });

  it('files an on-device translation as offline', async () => {
    const repo = await repository();
    const offline = createOfflineTranslationService(
      createMlKitOfflineEngine({ native: fakeNative(['en', 'de']) }),
    );
    const router = createTranslationRouter({
      engines: [onlineEngine, offline],
      mode: () => 'offline',
    });

    await translateAndRecord(router, repo, { ...request, origin: 'voice' });
    await flush();

    const entries = await repo.listRecent({ limit: 1 });
    assert.equal(entries.ok, true);
    if (!entries.ok) return;

    // Both facts survive together: which engine ran, and how the text arrived.
    assert.equal(entries.value[0]?.engine, 'offline');
    assert.equal(entries.value[0]?.origin, 'voice');
    assert.equal(entries.value[0]?.translatedText, '[de] Hello');
  });

  it('writes nothing when the on-device engine has no models', async () => {
    const repo = await repository();
    const offline = createOfflineTranslationService(
      createMlKitOfflineEngine({ native: fakeNative([]) }),
    );
    const router = createTranslationRouter({ engines: [offline], mode: () => 'offline' });

    const result = await translateAndRecord(router, repo, request);
    await flush();

    assert.equal(result.ok, false);
    const entries = await repo.listRecent({ limit: 5 });
    assert.deepEqual(entries.ok ? entries.value : null, []);
  });
});

describe('removing and clearing', () => {
  it('deletes one entry and leaves the rest', async () => {
    const repo = await repository();
    const router = createTranslationRouter({ engines: [onlineEngine] });

    await translateAndRecord(router, repo, { ...request, text: 'one' });
    await flush();
    await translateAndRecord(router, repo, { ...request, text: 'two' });
    await flush();

    const before = await repo.listRecent({ limit: 10 });
    assert.equal(before.ok && before.value.length, 2);
    if (!before.ok) return;

    const target = before.value[0];
    assert.ok(target);
    assert.equal((await repo.remove(target.id)).ok, true);

    const after = await repo.listRecent({ limit: 10 });
    assert.equal(after.ok && after.value.length, 1);
    assert.equal(after.ok && after.value.some((entry) => entry.id === target.id), false);
  });

  it('clears everything', async () => {
    const repo = await repository();
    const router = createTranslationRouter({ engines: [onlineEngine] });

    await translateAndRecord(router, repo, request);
    await flush();

    assert.equal((await repo.clear()).ok, true);
    const entries = await repo.listRecent({ limit: 10 });
    assert.deepEqual(entries.ok ? entries.value : null, []);
  });

  it('notifies listeners on create, remove and clear, so screens refresh', async () => {
    const repo = await repository();
    const router = createTranslationRouter({ engines: [onlineEngine] });

    let notifications = 0;
    const unsubscribe = repo.subscribe(() => (notifications += 1));

    await translateAndRecord(router, repo, request);
    await flush();
    assert.ok(notifications >= 1, 'a new translation must refresh history');

    const entries = await repo.listRecent({ limit: 1 });
    const id = entries.ok ? entries.value[0]?.id : undefined;
    assert.ok(id);

    const afterCreate = notifications;
    await repo.remove(id);
    assert.ok(notifications > afterCreate, 'a delete must refresh history');

    const afterRemove = notifications;
    await repo.clear();
    assert.ok(notifications > afterRemove, 'clearing must refresh history');

    unsubscribe();
    const quiet = notifications;
    await translateAndRecord(router, repo, request);
    await flush();
    assert.equal(notifications, quiet, 'an unsubscribed listener hears nothing');
  });
});

describe('the wiring that produces an origin', () => {
  it('no longer hard-codes every translation as typed', () => {
    const hook = readFileSync('src/features/translation/hooks/use-translation.ts', 'utf8');

    assert.equal(hook.includes(`origin: 'text',`), false, 'the hard-coded origin is gone');
    assert.match(hook, /origin,/);
  });

  it('tags dictated, scanned and pasted text at the point it arrives', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    assert.match(screen, /setInput\(text, 'voice'\)/);
    assert.match(screen, /setInput\(text, 'camera'\)/);
    assert.match(screen, /setInput\(text, 'clipboard'\)/);
  });

  it('leaves typing as the default, so the composer passes through unchanged', () => {
    const composer = readFileSync(
      'src/features/translation/components/translation-composer.tsx',
      'utf8',
    );
    const hook = readFileSync('src/features/translation/hooks/use-translation.ts', 'utf8');

    assert.match(composer, /onChangeText=\{onChangeText\}/);
    assert.match(hook, /TranslationSource = 'text'/);
  });

  it('still never translates automatically after speech or a scan', () => {
    const speech = readFileSync('src/features/translation/hooks/use-speech-recognition.ts', 'utf8');
    const camera = readFileSync('src/features/translation/hooks/use-camera-ocr.ts', 'utf8');

    for (const source of [speech, camera]) {
      assert.equal(source.includes('services.translation'), false);
      assert.equal(source.includes('translate('), false);
    }
  });

  it('keeps one write path into history', () => {
    // A second producer is how two rows appear for one translation.
    const record = readFileSync('src/features/translation/record-translation.ts', 'utf8');
    assert.match(record, /history\.create\(result\.value\)/);
    assert.match(record, /result\.ok && options\.saveHistory !== false/);
  });
});
