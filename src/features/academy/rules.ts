import type { ItemStat, LessonProgress } from '@/types';

import { COURSE_DAYS } from './course/validate';

/**
 * The Academy's rules, as pure functions.
 *
 * What a score is worth, when a day opens, when a word comes back for review.
 * Kept out of the repository and the screens so each rule is written once and
 * tested without a database or a render.
 */

export const ACADEMY_RULES = {
  /** A checkpoint, and each part of the final exam, is passed at 70%. */
  passMark: 0.7,
  /** Free days at the start of someone's path, before the paywall. */
  freeDays: 1,
} as const;

const DAY_MS = 24 * 60 * 60 * 1000;

// --- Scores ---------------------------------------------------------------------

/** 0–3 stars for a score from 0 to 1. */
export function starsFor(score: number): number {
  if (score >= 0.9) return 3;
  if (score >= 0.75) return 2;
  if (score >= 0.5) return 1;
  return 0;
}

/**
 * Whether a finished attempt completes the day.
 *
 * A learning day is completed by finishing it, whatever the score: the
 * mistakes come back in review. A checkpoint is a gate, so it needs the pass
 * mark.
 */
export function completesDay(score: number, checkpoint: boolean): boolean {
  return checkpoint ? score >= ACADEMY_RULES.passMark : true;
}

// --- Unlocking --------------------------------------------------------------------

export type DayStatus =
  /** Finished. */
  | 'done'
  /** The next one to do, or any earlier one being redone. */
  | 'open'
  /** Reachable, but only with the Academy unlocked. */
  | 'paywalled'
  /** Comes after a day not yet finished. */
  | 'locked';

/**
 * Where each day stands.
 *
 * Unlocking is by completion, never by the calendar: someone may do several
 * days in one sitting. Days before `startDay` were placed out of and count as
 * done. The first `freeDays` of a path are open to everyone; the rest need
 * the Academy.
 */
export function dayStatus(
  day: number,
  completed: ReadonlySet<number>,
  startDay: number,
  hasAcademy: boolean,
): DayStatus {
  if (day < startDay || completed.has(day)) return 'done';
  if (day > startDay && !completed.has(day - 1)) return 'locked';
  const free = day < startDay + ACADEMY_RULES.freeDays;
  return free || hasAcademy ? 'open' : 'paywalled';
}

/** The day to continue with, or undefined once every day is done. */
export function nextDay(completed: ReadonlySet<number>, startDay: number): number | undefined {
  for (let day = startDay; day <= COURSE_DAYS; day++) {
    if (!completed.has(day)) return day;
  }
  return undefined;
}

/** Every day of the path done, so the final exam opens. */
export function allDaysDone(completed: ReadonlySet<number>, startDay: number): boolean {
  return nextDay(completed, startDay) === undefined;
}

export const completedDays = (progress: readonly LessonProgress[]): ReadonlySet<number> =>
  new Set(progress.map((entry) => entry.day));

// --- Spaced review -----------------------------------------------------------------

/**
 * Days until a word comes back, per Leitner box.
 *
 * Box 0 is a word just met; each right answer moves it up a box and spaces it
 * out; a wrong answer drops it back to box 1, to be seen again tomorrow.
 */
export const REVIEW_INTERVAL_DAYS = [0, 1, 2, 4, 7, 15, 30] as const;
const TOP_BOX = REVIEW_INTERVAL_DAYS.length - 1;

/** A word's record after one answer. `previous` is undefined the first time it is seen. */
export function answer(
  previous: ItemStat | undefined,
  identity: { courseId: string; itemId: string },
  correct: boolean,
  now: number,
): ItemStat {
  const box = correct ? Math.min((previous?.box ?? 0) + 1, TOP_BOX) : 1;
  return {
    courseId: identity.courseId,
    itemId: identity.itemId,
    correct: (previous?.correct ?? 0) + (correct ? 1 : 0),
    wrong: (previous?.wrong ?? 0) + (correct ? 0 : 1),
    box,
    lastSeenAt: now,
    nextReviewAt: now + REVIEW_INTERVAL_DAYS[box]! * DAY_MS,
  };
}

/** Words needing review now, soonest-due first. */
export function dueItems(stats: readonly ItemStat[], now: number, limit: number): ItemStat[] {
  return stats
    .filter((stat) => stat.nextReviewAt <= now)
    .sort((a, b) => a.nextReviewAt - b.nextReviewAt)
    .slice(0, Math.max(0, limit));
}

/** Words the learner has right most of the time, at a box that shows it lasted. */
export function wordsKnown(stats: readonly ItemStat[]): number {
  return stats.filter((stat) => stat.box >= 3).length;
}

/** The words missed most, for the report and the review after a failed exam. */
export function weakestItems(stats: readonly ItemStat[], limit: number): ItemStat[] {
  return stats
    .filter((stat) => stat.wrong > 0)
    .sort((a, b) => b.wrong / (b.correct + b.wrong) - a.wrong / (a.correct + a.wrong))
    .slice(0, Math.max(0, limit));
}

// --- Streak ---------------------------------------------------------------------------

/** A day number in the phone's own time zone, so a streak follows the user's midnight. */
const localDay = (timestamp: number) => {
  const date = new Date(timestamp);
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / DAY_MS);
};

/**
 * Consecutive days with at least one finished lesson, ending today or
 * yesterday. A streak survives until the end of the day after its last lesson.
 */
export function streak(completions: readonly number[], now: number): number {
  const days = new Set(completions.map(localDay));
  const today = localDay(now);
  let day = days.has(today) ? today : today - 1;
  let count = 0;
  while (days.has(day)) {
    count++;
    day--;
  }
  return count;
}
