import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  createConversationHistoryService,
  parseConversationHistory,
  serializeConversationHistory,
  type ConversationTurn,
  type TurnsByMode,
} from '@/services/conversation';
import type { PreferencesStorage } from '@/services/preferences';
import { appError, err, ok } from '@/utils';

/**
 * Whether a conversation survives closing the app.
 *
 * The service reuses the file-backed `PreferencesStorage` seam, so what is
 * worth pinning here is the same kind of thing `entitlements.test.ts` pins for
 * its own use of that seam: reading back never fails outward, a malformed
 * entry costs only itself, and no second persistence mechanism was installed
 * to get here.
 */

const read = (path: string) => readFileSync(path, 'utf8');

/** The same one-slot seam the file implementation fills, in memory. */
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

function failingStorage(): PreferencesStorage {
  const failure = async () => err(appError('storage_error', 'nope'));
  return { read: failure, write: failure, remove: failure };
}

function turn(id: string, patch: Partial<ConversationTurn> = {}): ConversationTurn {
  return {
    id,
    side: 'near',
    heard: `heard ${id}`,
    sourceLanguage: 'en',
    targetLanguage: 'de',
    ...patch,
  };
}

describe('parseConversationHistory', () => {
  it('reads back a well-formed transcript', () => {
    const stored: TurnsByMode = { person: [turn('a')], tutor: [] };

    const parsed = parseConversationHistory(JSON.parse(serializeConversationHistory(stored)));

    assert.deepEqual(parsed.person, [turn('a')]);
    assert.deepEqual(parsed.tutor, []);
  });

  it('keeps the opaque result, error and tutor shapes untouched', () => {
    const withEverything = turn('a', {
      result: { translatedText: 'hallo' } as ConversationTurn['result'],
      tutor: { kind: 'declined', message: 'no' } as ConversationTurn['tutor'],
    });
    const stored: TurnsByMode = { person: [withEverything], tutor: [] };

    const parsed = parseConversationHistory(JSON.parse(serializeConversationHistory(stored)));

    assert.deepEqual(parsed.person[0], withEverything);
  });

  it('is empty for anything that is not the stored shape', () => {
    for (const garbage of [null, undefined, 'a string', 42, [], {}, { turns: 'nope' }]) {
      const parsed = parseConversationHistory(garbage);
      assert.deepEqual(parsed, { person: [], tutor: [] }, JSON.stringify(garbage));
    }
  });

  it('drops one malformed turn without losing the rest', () => {
    const parsed = parseConversationHistory({
      turns: {
        person: [turn('a'), { id: 'b' /* missing everything else */ }, turn('c')],
        tutor: [],
      },
    });

    assert.deepEqual(
      parsed.person.map((t) => t.id),
      ['a', 'c'],
    );
  });

  it('refuses a language the catalogue does not recognise', () => {
    const parsed = parseConversationHistory({
      turns: { person: [turn('a', { sourceLanguage: 'not-a-real-language' })], tutor: [] },
    });

    assert.deepEqual(parsed.person, []);
  });

  it('refuses a side that is neither near nor far', () => {
    const parsed = parseConversationHistory({
      turns: { person: [{ ...turn('a'), side: 'sideways' }], tutor: [] },
    });

    assert.deepEqual(parsed.person, []);
  });
});

describe('the conversation history service', () => {
  it('starts empty on a first launch, not a failure', async () => {
    const service = createConversationHistoryService(memoryStorage(null));

    assert.deepEqual(await service.load(), { person: [], tutor: [] });
  });

  it('starts empty when storage cannot be read, rather than blocking the screen', async () => {
    const service = createConversationHistoryService(failingStorage());

    assert.deepEqual(await service.load(), { person: [], tutor: [] });
  });

  it('starts empty when the stored value is not valid JSON', async () => {
    const service = createConversationHistoryService(memoryStorage('{not json'));

    assert.deepEqual(await service.load(), { person: [], tutor: [] });
  });

  it('round-trips a transcript through save and load', async () => {
    const storage = memoryStorage();
    const service = createConversationHistoryService(storage);
    const turns: TurnsByMode = { person: [turn('a')], tutor: [turn('b')] };

    await service.save(turns);
    const loaded = await service.load();

    assert.deepEqual(loaded, turns);
  });

  it('reports a failed write rather than pretending it happened', async () => {
    const service = createConversationHistoryService(failingStorage());

    const result = await service.save({ person: [], tutor: [] });
    assert.equal(result.ok, false);
  });
});

describe('no second persistence mechanism was installed for this', () => {
  it('reuses PreferencesStorage rather than importing a storage API of its own', () => {
    const source = read('src/services/conversation/conversation-history-service.ts');

    for (const forbidden of ['expo-file-system', 'expo-sqlite', 'async-storage', 'AsyncStorage']) {
      assert.equal(source.includes(forbidden), false, forbidden);
    }
    assert.match(source, /PreferencesStorage/);
  });

  it('is bound in the registry through the same file-backed storage preferences use', () => {
    const registry = read('src/services/service-registry.ts');

    assert.match(registry, /createConversationHistoryService\(\s*createFilePreferencesStorage/);
  });
});
