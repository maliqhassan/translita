import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LATEST_SCHEMA_VERSION,
  TABLES,
  createAcademyRepository,
  createHistoryRepository,
} from '@/database';
import {
  ACADEMY_RULES,
  REVIEW_INTERVAL_DAYS,
  allDaysDone,
  answer,
  completedDays,
  completesDay,
  dayStatus,
  dueItems,
  nextDay,
  starsFor,
  streak,
  todayProgress,
  weakestItems,
  weekActivity,
  wordsKnown,
} from '@/features/academy/rules';
import type { Enrollment, ItemStat } from '@/types';

import { createNodeSQLiteDatabase } from './support/node-sqlite-database';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 12, 12);

const unwrap = <T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T => {
  assert.equal(result.ok, true, `expected ok, got ${JSON.stringify(result)}`);
  if (!result.ok) throw new Error('unreachable');
  return result.value;
};

async function freshRepository() {
  const database = createNodeSQLiteDatabase();
  const repository = createAcademyRepository(database);
  unwrap(await repository.initialize());
  return { database, repository };
}

const enrollment = (over: Partial<Enrollment> = {}): Enrollment => ({
  courseId: 'en',
  baseLanguage: 'ur',
  goal: 'travel',
  level: 'beginner',
  minutesPerDay: 5,
  addressAs: 'unspecified',
  startDay: 1,
  startedAt: NOW,
  lastOpenedAt: NOW,
  ...over,
});

describe('migration 3: the Academy tables', () => {
  it('is the latest schema version', () => {
    assert.equal(LATEST_SCHEMA_VERSION, 4);
  });

  it('creates every Academy table', async () => {
    const { database } = await freshRepository();
    for (const table of [
      TABLES.academyEnrollment,
      TABLES.academyLessons,
      TABLES.academyItems,
      TABLES.academyPosition,
      TABLES.academyResults,
    ]) {
      const rows = unwrap(
        await database.select<{ name: string }>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?;",
          [table],
        ),
      );
      assert.equal(rows.length, 1, table);
    }
  });

  it('shares the one database with history, whichever opens it first', async () => {
    const database = createNodeSQLiteDatabase();
    unwrap(await createHistoryRepository(database).initialize());
    const academy = createAcademyRepository(database);
    unwrap(await academy.initialize());
    unwrap(await academy.saveEnrollment(enrollment()));
    assert.equal(unwrap(await academy.getEnrollment('en'))?.baseLanguage, 'ur');
  });
});

describe('the Academy repository', () => {
  it('lists courses with the one opened last first, and switches between them', async () => {
    const { repository } = await freshRepository();
    unwrap(await repository.saveEnrollment(enrollment({ courseId: 'de', lastOpenedAt: NOW })));
    unwrap(await repository.saveEnrollment(enrollment({ courseId: 'fr', lastOpenedAt: NOW + 1 })));
    assert.deepEqual(
      unwrap(await repository.listEnrollments()).map((entry) => entry.courseId),
      ['fr', 'de'],
    );
    unwrap(await repository.openCourse('de', NOW + 2));
    assert.equal(unwrap(await repository.listEnrollments())[0]?.courseId, 'de');
  });

  it('refuses to read or write before it is initialised', async () => {
    const repository = createAcademyRepository(createNodeSQLiteDatabase());
    const read = await repository.getEnrollment('en');
    assert.equal(read.ok, false);
  });

  it('saves and reads back an enrollment, and none for another course', async () => {
    const { repository } = await freshRepository();
    unwrap(await repository.saveEnrollment(enrollment({ addressAs: 'female', startDay: 11 })));
    const saved = unwrap(await repository.getEnrollment('en'));
    assert.equal(saved?.addressAs, 'female');
    assert.equal(saved?.startDay, 11);
    assert.equal(saved?.completedAt, undefined);
    assert.equal(unwrap(await repository.getEnrollment('es')), null);
  });

  it('keeps the best score, counts attempts, and keeps the first completion date', async () => {
    const { repository } = await freshRepository();
    const first = { courseId: 'en', lessonId: 'c01-d1', day: 1, completedAt: NOW };
    unwrap(await repository.recordLesson({ ...first, score: 0.9, stars: 3 }));
    const retry = unwrap(
      await repository.recordLesson({ ...first, score: 0.4, stars: 0, completedAt: NOW + DAY }),
    );
    assert.equal(retry.score, 0.9);
    assert.equal(retry.stars, 3);
    assert.equal(retry.attempts, 2);
    assert.equal(retry.completedAt, NOW);
    assert.deepEqual(
      unwrap(await repository.listProgress('en')).map((entry) => entry.lessonId),
      ['c01-d1'],
    );
  });

  it('lists finished days in day order', async () => {
    const { repository } = await freshRepository();
    for (const day of [3, 1, 2]) {
      unwrap(
        await repository.recordLesson({
          courseId: 'en',
          lessonId: `c01-d${day}`,
          day,
          score: 1,
          stars: 3,
          completedAt: NOW,
        }),
      );
    }
    assert.deepEqual(
      unwrap(await repository.listProgress('en')).map((entry) => entry.day),
      [1, 2, 3],
    );
  });

  it('saves word records together and lists only those due, soonest first', async () => {
    const { repository } = await freshRepository();
    const stat = (itemId: string, nextReviewAt: number): ItemStat => ({
      courseId: 'en',
      itemId,
      correct: 1,
      wrong: 0,
      box: 1,
      lastSeenAt: NOW,
      nextReviewAt,
    });
    unwrap(
      await repository.saveItemStats([
        stat('later', NOW + DAY),
        stat('second', NOW - 1000),
        stat('first', NOW - 5000),
      ]),
    );
    assert.equal(unwrap(await repository.listItemStats('en')).length, 3);
    assert.deepEqual(
      unwrap(await repository.listDueItems('en', NOW, 10)).map((item) => item.itemId),
      ['first', 'second'],
    );
  });

  it('remembers where the learner was inside a lesson, state and all', async () => {
    const { repository } = await freshRepository();
    const state = { answers: [true, false], heard: 'Hello' };
    unwrap(
      await repository.savePosition({
        courseId: 'en',
        lessonId: 'c01-d2',
        step: 3,
        state,
        updatedAt: NOW,
      }),
    );
    const position = unwrap(await repository.getPosition('en'));
    assert.equal(position?.step, 3);
    assert.deepEqual(position?.state, state);

    unwrap(await repository.clearPosition('en'));
    assert.equal(unwrap(await repository.getPosition('en')), null);
  });

  it('keeps results with their details, newest first, filtered by kind', async () => {
    const { repository } = await freshRepository();
    const result = (id: string, kind: 'checkpoint' | 'report', createdAt: number) => ({
      id,
      courseId: 'en',
      kind,
      score: 0.8,
      passed: true,
      data: { rubric: { grammar: 4 } },
      createdAt,
    });
    unwrap(await repository.addResult({ ...result('a', 'checkpoint', NOW), lessonId: 'c01-d5' }));
    unwrap(await repository.addResult(result('b', 'report', NOW + 1)));
    const all = unwrap(await repository.listResults('en'));
    assert.deepEqual(
      all.map((entry) => entry.id),
      ['b', 'a'],
    );
    const checkpoints = unwrap(await repository.listResults('en', 'checkpoint'));
    assert.equal(checkpoints[0]?.lessonId, 'c01-d5');
    assert.equal(checkpoints[0]?.passed, true);
    assert.deepEqual(checkpoints[0]?.data, { rubric: { grammar: 4 } });
  });

  it('starts a course over without touching another one', async () => {
    const { repository } = await freshRepository();
    unwrap(await repository.saveEnrollment(enrollment()));
    unwrap(await repository.saveEnrollment(enrollment({ courseId: 'es' })));
    unwrap(
      await repository.recordLesson({
        courseId: 'en',
        lessonId: 'c01-d1',
        day: 1,
        score: 1,
        stars: 3,
        completedAt: NOW,
      }),
    );
    unwrap(await repository.resetCourse('en'));
    assert.equal(unwrap(await repository.getEnrollment('en')), null);
    assert.equal(unwrap(await repository.listProgress('en')).length, 0);
    assert.notEqual(unwrap(await repository.getEnrollment('es')), null);
  });

  it('tells listeners after a change, and stops when they leave', async () => {
    const { repository } = await freshRepository();
    let calls = 0;
    const stop = repository.subscribe(() => calls++);
    unwrap(await repository.saveEnrollment(enrollment()));
    stop();
    unwrap(await repository.saveEnrollment(enrollment({ goal: 'business' })));
    assert.equal(calls, 1);
  });

  it('skips a damaged row instead of handing it on', async () => {
    const { database, repository } = await freshRepository();
    unwrap(
      await database.execute(
        `INSERT INTO ${TABLES.academyEnrollment}
          (course_id, base_language, goal, level, minutes_per_day, address_as, start_day, started_at)
         VALUES ('en', 'ur', 'not-a-goal', 'beginner', 5, 'male', 1, 0);`,
      ),
    );
    assert.equal(unwrap(await repository.getEnrollment('en')), null);
  });
});

describe('the Academy rules', () => {
  it('gives stars by score', () => {
    assert.deepEqual([0.95, 0.8, 0.6, 0.2].map(starsFor), [3, 2, 1, 0]);
  });

  it('completes a learning day by finishing it, a checkpoint only at the pass mark', () => {
    assert.equal(completesDay(0.1, false), true);
    assert.equal(completesDay(ACADEMY_RULES.passMark - 0.01, true), false);
    assert.equal(completesDay(ACADEMY_RULES.passMark, true), true);
  });

  it('opens Day 1 to everyone, and later days in order, with the Academy', () => {
    const none = new Set<number>();
    assert.equal(dayStatus(1, none, 1, false), 'open');
    assert.equal(dayStatus(2, none, 1, true), 'locked');
    const dayOneDone = new Set([1]);
    assert.equal(dayStatus(1, dayOneDone, 1, false), 'done');
    // The paywall sits on Day 2 for someone without the Academy.
    assert.equal(dayStatus(2, dayOneDone, 1, false), 'paywalled');
    assert.equal(dayStatus(2, dayOneDone, 1, true), 'open');
    assert.equal(dayStatus(3, dayOneDone, 1, true), 'locked');
  });

  it('counts placed-out days as done and gives the first placed day free', () => {
    assert.equal(dayStatus(5, new Set(), 11, false), 'done');
    assert.equal(dayStatus(11, new Set(), 11, false), 'open');
    assert.equal(dayStatus(12, new Set([11]), 11, false), 'paywalled');
  });

  it('continues from the first unfinished day, and opens the final when all are done', () => {
    assert.equal(nextDay(new Set([1, 2, 4]), 1), 3);
    const all = new Set(Array.from({ length: 60 }, (_, i) => i + 1));
    assert.equal(nextDay(all, 1), undefined);
    assert.equal(allDaysDone(all, 1), true);
    assert.equal(allDaysDone(new Set(Array.from({ length: 50 }, (_, i) => i + 11)), 11), true);
    assert.equal(allDaysDone(new Set([1]), 1), false);
  });

  it('reads finished days from progress', () => {
    const done = completedDays([
      {
        courseId: 'en',
        lessonId: 'c01-d1',
        day: 1,
        score: 1,
        stars: 3,
        attempts: 1,
        completedAt: 0,
      },
    ]);
    assert.equal(done.has(1), true);
  });

  it('moves a word up a box when right, back to box 1 when wrong, spacing reviews', () => {
    const id = { courseId: 'en', itemId: 'c01-d1-i1' };
    const first = answer(undefined, id, true, NOW);
    assert.equal(first.box, 1);
    assert.equal(first.nextReviewAt, NOW + REVIEW_INTERVAL_DAYS[1] * DAY);
    const second = answer(first, id, true, NOW);
    assert.equal(second.box, 2);
    assert.equal(second.correct, 2);
    const missed = answer(second, id, false, NOW);
    assert.equal(missed.box, 1);
    assert.equal(missed.wrong, 1);

    let top = first;
    for (let i = 0; i < 20; i++) top = answer(top, id, true, NOW);
    assert.equal(top.box, REVIEW_INTERVAL_DAYS.length - 1);
  });

  it('picks due words, known words and the weakest ones', () => {
    const stat = (itemId: string, box: number, correct: number, wrong: number, due: number) => ({
      courseId: 'en',
      itemId,
      box,
      correct,
      wrong,
      lastSeenAt: 0,
      nextReviewAt: due,
    });
    const stats = [
      stat('a', 4, 9, 1, NOW + DAY),
      stat('b', 1, 1, 3, NOW - 10),
      stat('c', 2, 2, 2, NOW - 20),
    ];
    assert.deepEqual(
      dueItems(stats, NOW, 5).map((s) => s.itemId),
      ['c', 'b'],
    );
    assert.equal(wordsKnown(stats), 1);
    assert.deepEqual(
      weakestItems(stats, 2).map((s) => s.itemId),
      ['b', 'c'],
    );
  });

  it('counts a streak of consecutive days, alive until the day after the last', () => {
    const at = (daysAgo: number) => NOW - daysAgo * DAY;
    assert.equal(streak([at(0), at(1), at(2), at(4)], NOW), 3);
    assert.equal(streak([at(1), at(2)], NOW), 2);
    assert.equal(streak([at(2)], NOW), 0);
    assert.equal(streak([], NOW), 0);
  });

  it("fills today's goal with a lesson finished today, or part of one left today", () => {
    const place = (step: number, updatedAt = NOW) => ({ step, total: 20, updatedAt });
    assert.equal(todayProgress([NOW - 60_000], undefined, NOW), 1);
    assert.equal(todayProgress([NOW - DAY], undefined, NOW), 0);
    assert.equal(todayProgress([], place(5), NOW), 0.25);
    // A lesson left yesterday is not today's work.
    assert.equal(todayProgress([], place(5, NOW - DAY), NOW), 0);
    // Only a finished lesson fills the ring.
    assert.ok(todayProgress([], place(20), NOW) < 1);
    assert.equal(todayProgress([], { step: 3, total: 0, updatedAt: NOW }, NOW), 0);
  });

  it('shows the last seven days, ending today', () => {
    const week = weekActivity([NOW, NOW - 2 * DAY, NOW - 9 * DAY], NOW);
    assert.equal(week.length, 7);
    assert.deepEqual(
      week.map((day) => day.done),
      [false, false, false, false, true, false, true],
    );
    assert.deepEqual(
      week.map((day) => day.today),
      [false, false, false, false, false, false, true],
    );
    assert.ok(week.every((day, index) => index === 0 || day.date > week[index - 1]!.date));
  });
});
