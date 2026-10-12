import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LATEST_SCHEMA_VERSION,
  MIGRATIONS,
  createHistoryRepository,
  pendingMigrations,
  runMigrations,
  toHistoryEntries,
  toHistoryEntry,
} from '@/database';
import type { TranslationResult } from '@/types';

import { createNodeSQLiteDatabase } from './support/node-sqlite-database';

/**
 * Day 6: persistence, exercised against a real SQLite engine.
 *
 * The repository under test is the production one; only the driver differs,
 * which is what the Day 1 `Database` seam exists for.
 */

async function freshDatabase() {
  const database = createNodeSQLiteDatabase();
  const opened = await database.open();
  assert.equal(opened.ok, true);
  return database;
}

async function freshRepository() {
  const database = await freshDatabase();
  const repository = createHistoryRepository(database);
  const initialised = await repository.initialize();
  assert.equal(initialised.ok, true, 'repository should initialise');
  return { database, repository };
}

let sequence = 0;
function translation(over: Partial<TranslationResult> = {}): TranslationResult {
  sequence += 1;
  return {
    id: `tr_${sequence}`,
    sourceText: 'Hello',
    translatedText: 'Hallo',
    sourceLanguage: 'en',
    targetLanguage: 'de',
    engine: 'online',
    origin: 'text',
    createdAt: 1_700_000_000_000 + sequence,
    ...over,
  };
}

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
};

describe('database and migrations', () => {
  it('initialises and reports ready', async () => {
    const { repository } = await freshRepository();
    assert.equal(repository.isReady(), true);
  });

  it('runs every migration and stamps the version', async () => {
    const database = await freshDatabase();
    const outcome = unwrap(await runMigrations(database));

    assert.equal(outcome.from, 0);
    assert.equal(outcome.to, LATEST_SCHEMA_VERSION);
    assert.deepEqual(
      [...outcome.applied],
      MIGRATIONS.map((migration) => migration.version),
    );

    const version = unwrap(await database.select<{ user_version: number }>('PRAGMA user_version;'));
    assert.equal(version[0]?.user_version, LATEST_SCHEMA_VERSION);
  });

  it('is idempotent: a second run applies nothing', async () => {
    const database = await freshDatabase();
    await runMigrations(database);

    const second = unwrap(await runMigrations(database));
    assert.deepEqual([...second.applied], [], 'nothing should be re-applied');
    assert.equal(second.from, LATEST_SCHEMA_VERSION);
  });

  it('is safe to replay from scratch over an existing schema', async () => {
    const database = await freshDatabase();
    await runMigrations(database);
    // Force a replay as if the version stamp had been lost.
    await database.execute('PRAGMA user_version = 0;');
    const replayed = await runMigrations(database);
    assert.equal(replayed.ok, true, 'IF NOT EXISTS should make replay safe');
  });

  it('creates the history table and its indexes', async () => {
    const database = await freshDatabase();
    await runMigrations(database);

    const tables = unwrap(
      await database.select<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table';",
      ),
    ).map((row) => row.name);
    assert.ok(tables.includes('translations'), `tables: ${tables.join(', ')}`);

    const indexes = unwrap(
      await database.select<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'index';",
      ),
    ).map((row) => row.name);
    assert.ok(indexes.includes('idx_translations_created_at'));
    assert.ok(indexes.includes('idx_translations_favourite'));
  });

  it('selects only migrations above the current version', () => {
    assert.equal(pendingMigrations(0).length, MIGRATIONS.length);
    assert.equal(pendingMigrations(LATEST_SCHEMA_VERSION).length, 0);
    assert.deepEqual(
      pendingMigrations(1).map((migration) => migration.version),
      [2, 3, 4],
    );
    assert.deepEqual(
      pendingMigrations(2).map((migration) => migration.version),
      [3, 4],
    );
  });

  it('refuses queries before initialisation', async () => {
    const repository = createHistoryRepository(createNodeSQLiteDatabase());
    assert.equal(repository.isReady(), false);
    const result = await repository.listRecent();
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'storage_error');
  });
});

describe('history repository', () => {
  it('creates and reads back an entry', async () => {
    const { repository } = await freshRepository();
    const created = unwrap(await repository.create(translation()));

    assert.equal(created.sourceText, 'Hello');
    assert.equal(created.translatedText, 'Hallo');
    assert.equal(created.sourceLanguage, 'en');
    assert.equal(created.targetLanguage, 'de');
    assert.equal(created.isFavorite, false);

    const fetched = unwrap(await repository.getById(created.id));
    assert.deepEqual(fetched, created);
  });

  it('gives the history record its own id, not the translation result id', async () => {
    const { repository } = await freshRepository();
    const result = translation({ id: 'tr_cache_hit' });
    const created = unwrap(await repository.create(result));
    assert.notEqual(created.id, result.id);
    assert.ok(created.id.startsWith('h_'));
  });

  it('preserves LanguageIds rather than collapsing to codes', async () => {
    const { repository } = await freshRepository();
    const created = unwrap(
      await repository.create(translation({ sourceLanguage: 'zh-Hant', targetLanguage: 'pt-BR' })),
    );
    const fetched = unwrap(await repository.getById(created.id));
    assert.equal(fetched?.sourceLanguage, 'zh-Hant');
    assert.equal(fetched?.targetLanguage, 'pt-BR');
  });

  it('lists newest first', async () => {
    const { repository } = await freshRepository();
    await repository.create(translation({ translatedText: 'first', createdAt: 1000 }));
    await repository.create(translation({ translatedText: 'second', createdAt: 3000 }));
    await repository.create(translation({ translatedText: 'third', createdAt: 2000 }));

    const listed = unwrap(await repository.listRecent());
    assert.deepEqual(
      listed.map((entry) => entry.translatedText),
      ['second', 'third', 'first'],
    );
  });

  it('honours limit and offset', async () => {
    const { repository } = await freshRepository();
    for (let index = 0; index < 5; index += 1) {
      await repository.create(translation({ createdAt: 1000 + index }));
    }

    assert.equal(unwrap(await repository.listRecent({ limit: 2 })).length, 2);
    assert.equal(unwrap(await repository.listRecent({ limit: 2, offset: 4 })).length, 1);
    assert.equal(unwrap(await repository.count()), 5);
  });

  it('keeps duplicate translations as separate events', async () => {
    const { repository } = await freshRepository();
    const first = unwrap(await repository.create(translation({ id: 'tr_same' })));
    const second = unwrap(await repository.create(translation({ id: 'tr_same' })));

    assert.notEqual(first.id, second.id, 'each translate action is its own record');
    assert.equal(unwrap(await repository.count()), 2);
  });

  it('preserves the timestamp exactly as given', async () => {
    const { repository } = await freshRepository();
    const createdAt = 1_712_345_678_901;
    const created = unwrap(await repository.create(translation({ createdAt })));
    assert.equal(created.createdAt, createdAt);
    assert.equal(unwrap(await repository.getById(created.id))?.createdAt, createdAt);
  });

  it('returns null for a missing id rather than failing', async () => {
    const { repository } = await freshRepository();
    const result = await repository.getById('does-not-exist');
    assert.equal(result.ok, true);
    assert.equal(unwrap(result), null);
  });
});

describe('search', () => {
  async function seeded() {
    const { repository } = await freshRepository();
    await repository.create(
      translation({ sourceText: 'Good morning', translatedText: 'Guten Morgen' }),
    );
    await repository.create(
      translation({ sourceText: 'Where is the station', translatedText: 'Wo ist der Bahnhof' }),
    );
    await repository.create(
      translation({
        sourceText: 'Thank you',
        translatedText: 'Gracias',
        targetLanguage: 'es',
      }),
    );
    return repository;
  }

  it('matches source text', async () => {
    const repository = await seeded();
    const found = unwrap(await repository.search('morning'));
    assert.equal(found.length, 1);
    assert.equal(found[0]?.translatedText, 'Guten Morgen');
  });

  it('matches translated text', async () => {
    const repository = await seeded();
    const found = unwrap(await repository.search('Bahnhof'));
    assert.equal(found.length, 1);
    assert.equal(found[0]?.sourceText, 'Where is the station');
  });

  it('matches language information', async () => {
    const repository = await seeded();
    const found = unwrap(await repository.search('es'));
    assert.ok(found.length >= 1);
  });

  it('is case insensitive for ASCII', async () => {
    const repository = await seeded();
    assert.equal(unwrap(await repository.search('MORNING')).length, 1);
  });

  it('returns everything for an empty query', async () => {
    const repository = await seeded();
    assert.equal(unwrap(await repository.search('   ')).length, 3);
  });

  it('returns nothing for a term that does not occur', async () => {
    const repository = await seeded();
    assert.equal(unwrap(await repository.search('zzzzz')).length, 0);
  });

  it('treats SQL metacharacters as text, not syntax', async () => {
    const repository = await seeded();
    const hostile = [
      "'; DROP TABLE translations; --",
      "' OR '1'='1",
      '" OR 1=1 --',
      '%',
      '_',
      '\\',
      "Robert'); DROP TABLE translations;--",
      'UNION SELECT * FROM translations',
    ];

    for (const term of hostile) {
      const result = await repository.search(term);
      assert.equal(result.ok, true, `search must survive ${term}`);
    }

    // The table is intact and nothing was deleted.
    assert.equal(unwrap(await repository.count()), 3);
  });

  it('does not let a wildcard match everything', async () => {
    const repository = await seeded();
    // `%` is escaped, so it searches for a literal percent sign.
    assert.equal(unwrap(await repository.search('%')).length, 0);
  });
});

describe('favourites', () => {
  it('favourites and unfavourites', async () => {
    const { repository } = await freshRepository();
    const created = unwrap(await repository.create(translation()));

    const favourited = unwrap(await repository.toggleFavorite(created.id));
    assert.equal(favourited?.isFavorite, true);

    const unfavourited = unwrap(await repository.toggleFavorite(created.id));
    assert.equal(unfavourited?.isFavorite, false);
  });

  it('sets an explicit favourite state', async () => {
    const { repository } = await freshRepository();
    const created = unwrap(await repository.create(translation()));
    assert.equal(unwrap(await repository.setFavorite(created.id, true))?.isFavorite, true);
    assert.equal(unwrap(await repository.setFavorite(created.id, true))?.isFavorite, true);
  });

  it('lists only favourites, newest first', async () => {
    const { repository } = await freshRepository();
    const a = unwrap(await repository.create(translation({ createdAt: 1000 })));
    await repository.create(translation({ createdAt: 2000 }));
    const c = unwrap(await repository.create(translation({ createdAt: 3000 })));

    await repository.setFavorite(a.id, true);
    await repository.setFavorite(c.id, true);

    const favourites = unwrap(await repository.listFavorites());
    assert.deepEqual(
      favourites.map((entry) => entry.id),
      [c.id, a.id],
    );
  });

  it('returns null when favouriting a missing entry', async () => {
    const { repository } = await freshRepository();
    assert.equal(unwrap(await repository.toggleFavorite('nope')), null);
  });
});

describe('delete and clear', () => {
  it('deletes one entry and leaves the rest', async () => {
    const { repository } = await freshRepository();
    const a = unwrap(await repository.create(translation()));
    const b = unwrap(await repository.create(translation()));

    assert.equal((await repository.remove(a.id)).ok, true);
    assert.equal(unwrap(await repository.getById(a.id)), null);
    assert.ok(unwrap(await repository.getById(b.id)));
    assert.equal(unwrap(await repository.count()), 1);
  });

  it('removes the favourite along with its record', async () => {
    const { repository } = await freshRepository();
    const created = unwrap(await repository.create(translation()));
    await repository.setFavorite(created.id, true);

    await repository.remove(created.id);
    assert.equal(unwrap(await repository.listFavorites()).length, 0);
  });

  it('deleting a missing id is not an error', async () => {
    const { repository } = await freshRepository();
    assert.equal((await repository.remove('nope')).ok, true);
  });

  it('clears everything including favourites', async () => {
    const { repository } = await freshRepository();
    const created = unwrap(await repository.create(translation()));
    await repository.setFavorite(created.id, true);
    await repository.create(translation());

    assert.equal((await repository.clear()).ok, true);
    assert.equal(unwrap(await repository.count()), 0);
    assert.equal(unwrap(await repository.listFavorites()).length, 0);
  });
});

describe('change notifications', () => {
  it('notifies listeners on every mutation', async () => {
    const { repository } = await freshRepository();
    let notifications = 0;
    const unsubscribe = repository.subscribe(() => {
      notifications += 1;
    });

    const created = unwrap(await repository.create(translation()));
    await repository.setFavorite(created.id, true);
    await repository.remove(created.id);
    await repository.clear();

    assert.equal(notifications, 4);

    unsubscribe();
    await repository.create(translation());
    assert.equal(notifications, 4, 'unsubscribed listeners stop hearing');
  });
});

describe('malformed rows', () => {
  it('drops rows that cannot be trusted rather than failing the whole read', async () => {
    const { database, repository } = await freshRepository();
    await repository.create(translation({ translatedText: 'good' }));

    // A row an older or corrupted build could have written.
    await database.execute(
      `INSERT INTO translations
        (id, source_text, translated_text, source_language, detected_language,
         target_language, engine, origin, is_favorite, created_at)
       VALUES ('broken', 'x', 'y', '', NULL, 'de', 'online', 'text', 0, 1000);`,
    );

    const listed = unwrap(await repository.listRecent());
    assert.equal(listed.length, 1, 'the unusable row is skipped');
    assert.equal(listed[0]?.translatedText, 'good');
  });

  it('maps unknown engine and origin values onto safe defaults', () => {
    const entry = toHistoryEntry({
      id: 'x',
      source_text: 'a',
      translated_text: 'b',
      source_language: 'en',
      target_language: 'de',
      engine: 'quantum',
      origin: 'telepathy',
      is_favorite: 0,
      created_at: 5,
    });
    assert.equal(entry?.engine, 'online');
    assert.equal(entry?.origin, 'text');
  });

  it('rejects rows missing what the UI needs', () => {
    for (const row of [
      null,
      'string',
      {},
      {
        id: '',
        source_text: 'a',
        translated_text: 'b',
        source_language: 'en',
        target_language: 'de',
      },
      { id: 'x', translated_text: 'b', source_language: 'en', target_language: 'de' },
      { id: 'x', source_text: 'a', translated_text: 'b', target_language: 'de' },
    ]) {
      assert.equal(toHistoryEntry(row), undefined, JSON.stringify(row));
    }
  });

  it('survives a non-numeric timestamp', () => {
    const entry = toHistoryEntry({
      id: 'x',
      source_text: 'a',
      translated_text: 'b',
      source_language: 'en',
      target_language: 'de',
      created_at: 'not a number',
    });
    assert.equal(entry?.createdAt, 0);
  });

  it('filters a mixed result set', () => {
    const entries = toHistoryEntries([
      {
        id: 'a',
        source_text: 's',
        translated_text: 't',
        source_language: 'en',
        target_language: 'de',
      },
      null,
      { id: '' },
    ]);
    assert.equal(entries.length, 1);
  });
});

describe('persistence across repository instances', () => {
  it('history survives recreating the repository over the same database', async () => {
    const database = await freshDatabase();

    const first = createHistoryRepository(database);
    await first.initialize();
    const created = unwrap(await first.create(translation({ translatedText: 'persisted' })));

    // A new repository over the same file, as after an app restart.
    const second = createHistoryRepository(database);
    await second.initialize();

    const fetched = unwrap(await second.getById(created.id));
    assert.equal(fetched?.translatedText, 'persisted');
    assert.equal(unwrap(await second.count()), 1);
  });

  it('favourite state survives recreating the repository', async () => {
    const database = await freshDatabase();

    const first = createHistoryRepository(database);
    await first.initialize();
    const created = unwrap(await first.create(translation()));
    await first.setFavorite(created.id, true);

    const second = createHistoryRepository(database);
    await second.initialize();

    assert.equal(unwrap(await second.getById(created.id))?.isFavorite, true);
    assert.equal(unwrap(await second.listFavorites()).length, 1);
  });

  it('re-initialising does not re-run migrations or lose data', async () => {
    const database = await freshDatabase();
    const repository = createHistoryRepository(database);

    await repository.initialize();
    await repository.create(translation());
    await repository.initialize();

    assert.equal(unwrap(await repository.count()), 1);
  });
});
