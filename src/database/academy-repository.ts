import type { ServiceResult } from '@/services';
import type {
  AcademyResult,
  AcademyResultKind,
  AddressForm,
  Enrollment,
  ItemStat,
  LearningGoal,
  LearningLevel,
  LessonPosition,
  LessonProgress,
  Unsubscribe,
} from '@/types';
import { appError, err, ok } from '@/utils';

import type { Database } from './database';
import { TABLES } from './schema';

/**
 * The AI Academy's saved progress.
 *
 * The only place SQL for the Academy lives. It stores and reads; it decides
 * nothing. What a score is worth, when a day unlocks and when a word is due
 * again are the Academy's rules (`features/academy/rules.ts`), so they can be
 * tested without a database and changed without a migration.
 *
 * Shares the one database connection with history. It never opens or
 * migrates on its own initiative before history has: the database provider
 * initialises history first, then this, so the two never race to open the
 * same file.
 */
export type AcademyRepository = {
  initialize(): ServiceResult<void>;
  isReady(): boolean;

  getEnrollment(courseId: string): ServiceResult<Enrollment | null>;
  /** Every course started, the one opened most recently first. */
  listEnrollments(): ServiceResult<Enrollment[]>;
  saveEnrollment(enrollment: Enrollment): ServiceResult<void>;
  /** Makes a started course the one shown, by marking it opened now. */
  openCourse(courseId: string, now: number): ServiceResult<void>;

  listProgress(courseId: string): ServiceResult<LessonProgress[]>;
  /**
   * Records a finished attempt at a day. Keeps the best score and stars, counts
   * the attempt, and keeps the date it was first completed.
   */
  recordLesson(entry: Omit<LessonProgress, 'attempts'>): ServiceResult<LessonProgress>;

  listItemStats(courseId: string): ServiceResult<ItemStat[]>;
  /** Words due for review, soonest first. */
  listDueItems(courseId: string, now: number, limit: number): ServiceResult<ItemStat[]>;
  saveItemStats(stats: readonly ItemStat[]): ServiceResult<void>;

  getPosition(courseId: string): ServiceResult<LessonPosition | null>;
  savePosition(position: LessonPosition): ServiceResult<void>;
  clearPosition(courseId: string): ServiceResult<void>;

  addResult(result: AcademyResult): ServiceResult<void>;
  listResults(courseId: string, kind?: AcademyResultKind): ServiceResult<AcademyResult[]>;

  /** Removes everything for a course: starting over. */
  resetCourse(courseId: string): ServiceResult<void>;

  /** Fires after any change, so screens can refresh without polling. */
  subscribe(listener: () => void): Unsubscribe;
};

const GOALS: readonly LearningGoal[] = ['travel', 'business', 'conversation'];
const LEVELS: readonly LearningLevel[] = ['beginner', 'some'];
const ADDRESS: readonly AddressForm[] = ['male', 'female', 'unspecified'];

// --- Row mapping ---------------------------------------------------------------
// Rows are read as `unknown` and checked field by field, the same way history
// is: a damaged row is skipped rather than handed to a screen half-formed.

type Row = Record<string, unknown>;
const isRow = (value: unknown): value is Row => typeof value === 'object' && value !== null;
const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;
const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
  allowed.find((option) => option === value);

/** JSON in a TEXT column, or undefined if it is absent or unreadable. */
function parseJson(value: unknown): unknown {
  if (typeof value !== 'string') return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function toEnrollment(row: unknown): Enrollment | null {
  if (!isRow(row)) return null;
  const courseId = str(row.course_id);
  const baseLanguage = str(row.base_language);
  const goal = oneOf(row.goal, GOALS);
  const level = oneOf(row.level, LEVELS);
  const minutesPerDay = num(row.minutes_per_day);
  const addressAs = oneOf(row.address_as, ADDRESS);
  const startDay = num(row.start_day);
  const startedAt = num(row.started_at);
  const lastOpenedAt = num(row.last_opened_at) ?? 0;
  if (
    !courseId ||
    !baseLanguage ||
    !goal ||
    !level ||
    minutesPerDay === undefined ||
    !addressAs ||
    startDay === undefined ||
    startedAt === undefined
  ) {
    return null;
  }
  const completedAt = num(row.completed_at);
  return {
    courseId,
    baseLanguage,
    goal,
    level,
    minutesPerDay,
    addressAs,
    startDay,
    startedAt,
    lastOpenedAt,
    ...(completedAt !== undefined ? { completedAt } : {}),
  };
}

function toProgress(row: unknown): LessonProgress | null {
  if (!isRow(row)) return null;
  const courseId = str(row.course_id);
  const lessonId = str(row.lesson_id);
  const day = num(row.day);
  const score = num(row.score);
  const stars = num(row.stars);
  const attempts = num(row.attempts);
  const completedAt = num(row.completed_at);
  if (
    !courseId ||
    !lessonId ||
    day === undefined ||
    score === undefined ||
    stars === undefined ||
    attempts === undefined ||
    completedAt === undefined
  ) {
    return null;
  }
  return { courseId, lessonId, day, score, stars, attempts, completedAt };
}

function toItemStat(row: unknown): ItemStat | null {
  if (!isRow(row)) return null;
  const courseId = str(row.course_id);
  const itemId = str(row.item_id);
  const correct = num(row.correct);
  const wrong = num(row.wrong);
  const box = num(row.box);
  const lastSeenAt = num(row.last_seen_at);
  const nextReviewAt = num(row.next_review_at);
  if (
    !courseId ||
    !itemId ||
    correct === undefined ||
    wrong === undefined ||
    box === undefined ||
    lastSeenAt === undefined ||
    nextReviewAt === undefined
  ) {
    return null;
  }
  return { courseId, itemId, correct, wrong, box, lastSeenAt, nextReviewAt };
}

function toPosition(row: unknown): LessonPosition | null {
  if (!isRow(row)) return null;
  const courseId = str(row.course_id);
  const lessonId = str(row.lesson_id);
  const step = num(row.step);
  const updatedAt = num(row.updated_at);
  if (!courseId || !lessonId || step === undefined || updatedAt === undefined) return null;
  return { courseId, lessonId, step, state: parseJson(row.state) ?? null, updatedAt };
}

const RESULT_KINDS: readonly AcademyResultKind[] = [
  'checkpoint',
  'final_written',
  'final_conversation',
  'report',
];

function toResult(row: unknown): AcademyResult | null {
  if (!isRow(row)) return null;
  const id = str(row.id);
  const courseId = str(row.course_id);
  const kind = oneOf(row.kind, RESULT_KINDS);
  const score = num(row.score);
  const passed = num(row.passed);
  const createdAt = num(row.created_at);
  if (!id || !courseId || !kind || score === undefined || passed === undefined) return null;
  if (createdAt === undefined) return null;
  const lessonId = str(row.lesson_id);
  const data = parseJson(row.data);
  return {
    id,
    courseId,
    kind,
    score,
    passed: passed === 1,
    createdAt,
    ...(lessonId ? { lessonId } : {}),
    ...(data !== undefined ? { data } : {}),
  };
}

/** Enrollments with when each was last opened. */
const ENROLLMENTS = `SELECT e.*, COALESCE(o.opened_at, 0) AS last_opened_at
  FROM ${TABLES.academyEnrollment} e
  LEFT JOIN ${TABLES.academyOpened} o ON o.course_id = e.course_id`;

const mapRows = <T>(rows: readonly unknown[], map: (row: unknown) => T | null): T[] =>
  rows.map(map).filter((value): value is T => value !== null);

// --- Repository ------------------------------------------------------------------

export function createAcademyRepository(database: Database): AcademyRepository {
  let ready = false;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  function requireReady() {
    if (!ready) return err(appError('storage_error', 'The local database is not ready.'));
    return ok(undefined);
  }

  /** A write, then a notification if it worked. */
  async function write(sql: string, params: readonly unknown[]): ServiceResult<void> {
    const guard = requireReady();
    if (!guard.ok) return guard;
    const written = await database.execute(sql, params);
    if (written.ok) notify();
    return written;
  }

  async function read<T>(
    sql: string,
    params: readonly unknown[],
    map: (row: unknown) => T | null,
  ): ServiceResult<T[]> {
    const guard = requireReady();
    if (!guard.ok) return guard;
    const rows = await database.select<unknown>(sql, params);
    if (!rows.ok) return rows;
    return ok(mapRows(rows.value, map));
  }

  return {
    async initialize() {
      if (ready) return ok(undefined);
      const opened = await database.open();
      if (!opened.ok) return opened;
      const migrated = await database.migrate();
      if (!migrated.ok) return migrated;
      ready = true;
      return ok(undefined);
    },

    isReady() {
      return ready;
    },

    async getEnrollment(courseId) {
      const rows = await read(
        `${ENROLLMENTS} WHERE e.course_id = ? LIMIT 1;`,
        [courseId],
        toEnrollment,
      );
      return rows.ok ? ok(rows.value[0] ?? null) : rows;
    },

    listEnrollments() {
      return read(
        `${ENROLLMENTS} ORDER BY last_opened_at DESC, e.started_at DESC;`,
        [],
        toEnrollment,
      );
    },

    openCourse(courseId, now) {
      return write(
        `INSERT OR REPLACE INTO ${TABLES.academyOpened} (course_id, opened_at) VALUES (?, ?);`,
        [courseId, now],
      );
    },

    async saveEnrollment(enrollment) {
      const guard = requireReady();
      if (!guard.ok) return guard;
      // The enrollment and when it was opened, together or not at all.
      const saved = await database.transaction(async (tx) => {
        const opened = await tx.execute(
          `INSERT OR REPLACE INTO ${TABLES.academyOpened} (course_id, opened_at) VALUES (?, ?);`,
          [enrollment.courseId, enrollment.lastOpenedAt],
        );
        if (!opened.ok) throw opened.error;
        const written = await tx.execute(
          `INSERT OR REPLACE INTO ${TABLES.academyEnrollment}
          (course_id, base_language, goal, level, minutes_per_day, address_as,
           start_day, started_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
          [
            enrollment.courseId,
            enrollment.baseLanguage,
            enrollment.goal,
            enrollment.level,
            enrollment.minutesPerDay,
            enrollment.addressAs,
            enrollment.startDay,
            enrollment.startedAt,
            enrollment.completedAt ?? null,
          ],
        );
        if (!written.ok) throw written.error;
      });
      if (saved.ok) notify();
      return saved;
    },

    listProgress(courseId) {
      return read(
        `SELECT * FROM ${TABLES.academyLessons} WHERE course_id = ? ORDER BY day ASC;`,
        [courseId],
        toProgress,
      );
    },

    async recordLesson(entry) {
      const existing = await read(
        `SELECT * FROM ${TABLES.academyLessons} WHERE course_id = ? AND lesson_id = ? LIMIT 1;`,
        [entry.courseId, entry.lessonId],
        toProgress,
      );
      if (!existing.ok) return existing;
      const before = existing.value[0];

      // The best attempt stands; a worse retry never lowers a day's score.
      const saved: LessonProgress = before
        ? {
            ...before,
            score: Math.max(before.score, entry.score),
            stars: Math.max(before.stars, entry.stars),
            attempts: before.attempts + 1,
          }
        : { ...entry, attempts: 1 };

      const written = await write(
        `INSERT OR REPLACE INTO ${TABLES.academyLessons}
          (course_id, lesson_id, day, score, stars, attempts, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?);`,
        [
          saved.courseId,
          saved.lessonId,
          saved.day,
          saved.score,
          saved.stars,
          saved.attempts,
          saved.completedAt,
        ],
      );
      return written.ok ? ok(saved) : written;
    },

    listItemStats(courseId) {
      return read(
        `SELECT * FROM ${TABLES.academyItems} WHERE course_id = ?;`,
        [courseId],
        toItemStat,
      );
    },

    listDueItems(courseId, now, limit) {
      return read(
        `SELECT * FROM ${TABLES.academyItems}
         WHERE course_id = ? AND next_review_at <= ?
         ORDER BY next_review_at ASC LIMIT ?;`,
        [courseId, now, Math.max(0, Math.floor(limit))],
        toItemStat,
      );
    },

    async saveItemStats(stats) {
      const guard = requireReady();
      if (!guard.ok) return guard;
      if (stats.length === 0) return ok(undefined);

      // One transaction: a lesson's answers are saved together or not at all.
      const saved = await database.transaction(async (tx) => {
        for (const stat of stats) {
          const written = await tx.execute(
            `INSERT OR REPLACE INTO ${TABLES.academyItems}
              (course_id, item_id, correct, wrong, box, last_seen_at, next_review_at)
             VALUES (?, ?, ?, ?, ?, ?, ?);`,
            [
              stat.courseId,
              stat.itemId,
              stat.correct,
              stat.wrong,
              stat.box,
              stat.lastSeenAt,
              stat.nextReviewAt,
            ],
          );
          if (!written.ok) throw written.error;
        }
      });
      if (saved.ok) notify();
      return saved;
    },

    async getPosition(courseId) {
      const rows = await read(
        `SELECT * FROM ${TABLES.academyPosition} WHERE course_id = ? LIMIT 1;`,
        [courseId],
        toPosition,
      );
      return rows.ok ? ok(rows.value[0] ?? null) : rows;
    },

    async savePosition(position) {
      let state: string;
      try {
        state = JSON.stringify(position.state ?? null);
      } catch (cause) {
        return err(appError('storage_error', 'The lesson position could not be saved.', cause));
      }
      // Saved after every step, and nobody is waiting on a list of positions,
      // so it does not notify: a redraw per answer would be wasted work.
      const guard = requireReady();
      if (!guard.ok) return guard;
      return database.execute(
        `INSERT OR REPLACE INTO ${TABLES.academyPosition}
          (course_id, lesson_id, step, state, updated_at)
         VALUES (?, ?, ?, ?, ?);`,
        [position.courseId, position.lessonId, position.step, state, position.updatedAt],
      );
    },

    clearPosition(courseId) {
      return write(`DELETE FROM ${TABLES.academyPosition} WHERE course_id = ?;`, [courseId]);
    },

    addResult(result) {
      let data: string | null = null;
      if (result.data !== undefined) {
        try {
          data = JSON.stringify(result.data);
        } catch (cause) {
          return Promise.resolve(
            err(appError('storage_error', 'The result could not be saved.', cause)),
          );
        }
      }
      return write(
        `INSERT OR REPLACE INTO ${TABLES.academyResults}
          (id, course_id, kind, lesson_id, score, passed, data, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?);`,
        [
          result.id,
          result.courseId,
          result.kind,
          result.lessonId ?? null,
          result.score,
          result.passed ? 1 : 0,
          data,
          result.createdAt,
        ],
      );
    },

    listResults(courseId, kind) {
      return kind
        ? read(
            `SELECT * FROM ${TABLES.academyResults}
             WHERE course_id = ? AND kind = ? ORDER BY created_at DESC;`,
            [courseId, kind],
            toResult,
          )
        : read(
            `SELECT * FROM ${TABLES.academyResults} WHERE course_id = ? ORDER BY created_at DESC;`,
            [courseId],
            toResult,
          );
    },

    async resetCourse(courseId) {
      const guard = requireReady();
      if (!guard.ok) return guard;
      const tables = [
        TABLES.academyEnrollment,
        TABLES.academyLessons,
        TABLES.academyItems,
        TABLES.academyPosition,
        TABLES.academyResults,
        TABLES.academyOpened,
      ];
      const cleared = await database.transaction(async (tx) => {
        for (const table of tables) {
          const done = await tx.execute(`DELETE FROM ${table} WHERE course_id = ?;`, [courseId]);
          if (!done.ok) throw done.error;
        }
      });
      if (cleared.ok) notify();
      return cleared;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
