import { TABLES } from './schema';

export type Migration = {
  /** Monotonic. Never renumber or edit a shipped migration — append instead. */
  version: number;
  name: string;
  statements: readonly string[];
};

/** Bump as migrations are appended; the runner compares against `user_version`. */
export const LATEST_SCHEMA_VERSION = 3;

export const MIGRATIONS: readonly Migration[] = [
  {
    version: 1,
    name: 'initial_schema',
    statements: [
      `CREATE TABLE IF NOT EXISTS ${TABLES.translations} (
        id TEXT PRIMARY KEY NOT NULL,
        source_text TEXT NOT NULL,
        translated_text TEXT NOT NULL,
        source_language TEXT NOT NULL,
        detected_language TEXT,
        target_language TEXT NOT NULL,
        engine TEXT NOT NULL,
        origin TEXT NOT NULL,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_translations_created_at
        ON ${TABLES.translations} (created_at DESC);`,
      `CREATE TABLE IF NOT EXISTS ${TABLES.languagePacks} (
        id TEXT PRIMARY KEY NOT NULL,
        source_language TEXT NOT NULL,
        target_language TEXT NOT NULL,
        version TEXT NOT NULL,
        status TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        installed_at INTEGER
      );`,
      `CREATE TABLE IF NOT EXISTS ${TABLES.preferences} (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );`,
    ],
  },
  {
    version: 2,
    name: 'favourite_history_index',
    statements: [
      // Favourites are listed newest-first, so the index carries the sort with
      // it and SQLite never has to sort the filtered rows.
      `CREATE INDEX IF NOT EXISTS idx_translations_favourite
        ON ${TABLES.translations} (is_favorite, created_at DESC);`,
    ],
  },
  {
    version: 3,
    name: 'academy',
    statements: [
      // One row per course the user has started.
      `CREATE TABLE IF NOT EXISTS ${TABLES.academyEnrollment} (
        course_id TEXT PRIMARY KEY NOT NULL,
        base_language TEXT NOT NULL,
        goal TEXT NOT NULL,
        level TEXT NOT NULL,
        minutes_per_day INTEGER NOT NULL,
        address_as TEXT NOT NULL,
        start_day INTEGER NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );`,
      // A finished day, kept at its best score.
      `CREATE TABLE IF NOT EXISTS ${TABLES.academyLessons} (
        course_id TEXT NOT NULL,
        lesson_id TEXT NOT NULL,
        day INTEGER NOT NULL,
        score REAL NOT NULL,
        stars INTEGER NOT NULL,
        attempts INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        PRIMARY KEY (course_id, lesson_id)
      );`,
      // How well each word is known, for spaced review.
      `CREATE TABLE IF NOT EXISTS ${TABLES.academyItems} (
        course_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        correct INTEGER NOT NULL,
        wrong INTEGER NOT NULL,
        box INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        next_review_at INTEGER NOT NULL,
        PRIMARY KEY (course_id, item_id)
      );`,
      // Review asks for what is due soonest, so the index carries that order.
      `CREATE INDEX IF NOT EXISTS idx_academy_items_due
        ON ${TABLES.academyItems} (course_id, next_review_at);`,
      // Where the learner is inside a lesson: one row per course.
      `CREATE TABLE IF NOT EXISTS ${TABLES.academyPosition} (
        course_id TEXT PRIMARY KEY NOT NULL,
        lesson_id TEXT NOT NULL,
        step INTEGER NOT NULL,
        state TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );`,
      // Checkpoints, the two parts of the final exam, and the report.
      `CREATE TABLE IF NOT EXISTS ${TABLES.academyResults} (
        id TEXT PRIMARY KEY NOT NULL,
        course_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        lesson_id TEXT,
        score REAL NOT NULL,
        passed INTEGER NOT NULL,
        data TEXT,
        created_at INTEGER NOT NULL
      );`,
      `CREATE INDEX IF NOT EXISTS idx_academy_results_course
        ON ${TABLES.academyResults} (course_id, kind, created_at DESC);`,
    ],
  },
];
