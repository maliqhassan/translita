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

// --- Today ------------------------------------------------------------------------------

/** Where a lesson was left, as far as today's progress needs it. */
export type SavedPlace = { step: number; total: number; updatedAt: number };

/**
 * How much of today's goal — one lesson a day — is done, from 0 to 1.
 *
 * A lesson finished today fills it. Otherwise a lesson left part-way today
 * counts for the share of its steps done; one left on an earlier day does not,
 * since today's work has not started.
 */
export function todayProgress(
  completions: readonly number[],
  place: SavedPlace | undefined,
  now: number,
): number {
  const today = localDay(now);
  if (completions.some((at) => localDay(at) === today)) return 1;
  if (!place || place.total <= 0 || localDay(place.updatedAt) !== today) return 0;
  return Math.min(Math.max(place.step / place.total, 0), 0.99);
}

export type WeekDay = {
  /** Local noon of the day, for naming it. */
  date: number;
  done: boolean;
  today: boolean;
};

/** The last seven days, oldest first and ending today, each with whether a lesson was finished. */
export function weekActivity(completions: readonly number[], now: number): WeekDay[] {
  const days = new Set(completions.map(localDay));
  const today = new Date(now);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6 + index, 12);
    const at = date.getTime();
    return { date: at, done: days.has(localDay(at)), today: index === 6 };
  });
}

// --- Coming back ---------------------------------------------------------------------

/** How long after leaving the Academy the app still reopens in it. */
export const ACADEMY_RETURN_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * Whether a launch should reopen the Academy, given when the app was last put
 * away in it (0 when it was put away anywhere else).
 */
export function shouldReturnToAcademy(leftAt: number, now: number): boolean {
  return leftAt > 0 && now - leftAt < ACADEMY_RETURN_WINDOW_MS;
}

// --- The final exam ------------------------------------------------------------------------

export const FINAL_RULES = {
  /** Part A: written and listening questions, drawn from the whole course. */
  questions: 40,
  /** Each part passes at the same mark as a checkpoint. */
  passMark: ACADEMY_RULES.passMark,
  /** The learner's lines in Part B, the final conversation. */
  conversationLines: 10,
} as const;

/** Marks out of 5 on the five speaking criteria. */
export type Marks = Readonly<Record<string, number>>;

/** The speaking test as a share, 0–1: every mark out of 5, together. */
export function rubricScore(marks: Marks): number {
  const values = Object.values(marks);
  if (!values.length) return 0;
  return values.reduce((sum, mark) => sum + mark, 0) / (values.length * 5);
}

/**
 * The level the course has brought the learner to, decided here, never by
 * the model: the report explains it. Below the pass mark on either part is
 * still A1; both passed is A2, and comfortably passed is A2+.
 */
export function estimateLevel(written: number, spoken: number): 'A1' | 'A2' | 'A2+' {
  if (written < FINAL_RULES.passMark || spoken < FINAL_RULES.passMark) return 'A1';
  return (written + spoken) / 2 >= 0.88 ? 'A2+' : 'A2';
}

/** A failed part can be taken again from the next day, so the review comes first. */
export function canRetake(lastAttemptAt: number | undefined, now: number): boolean {
  return lastAttemptAt === undefined || localDay(lastAttemptAt) !== localDay(now);
}

/**
 * Whether the final exam is open.
 *
 * Every day of the path finished, of a course that has all its days. A build
 * still being written can open it once its shipped days are done, so the
 * exam can be tried before the content is complete.
 */
export function finalUnlocked(
  completed: ReadonlySet<number>,
  startDay: number,
  shippedDays: number,
  allowIncomplete: boolean,
): boolean {
  const last = allowIncomplete ? shippedDays : COURSE_DAYS;
  if (shippedDays < last || last < startDay) return false;
  for (let day = startDay; day <= last; day++) if (!completed.has(day)) return false;
  return true;
}

/** Which skill each kind of question tests, for the report. */
export type Skill = 'reading' | 'vocabulary' | 'listening' | 'grammar';

/** Accuracy per skill, 0–1, from a part's marked answers. Skills not tested are left out. */
export function skillAccuracy(
  answers: readonly { skill: Skill; correct: boolean }[],
): Partial<Record<Skill, number>> {
  const tally: Partial<Record<Skill, { right: number; all: number }>> = {};
  for (const { skill, correct } of answers) {
    const entry = (tally[skill] ??= { right: 0, all: 0 });
    entry.all++;
    if (correct) entry.right++;
  }
  const result: Partial<Record<Skill, number>> = {};
  for (const [skill, entry] of Object.entries(tally) as [Skill, { right: number; all: number }][]) {
    result[skill] = entry.right / entry.all;
  }
  return result;
}

/** The words known best, most often right first: for the report. */
export function strongestItems(stats: readonly ItemStat[], limit: number): ItemStat[] {
  return stats
    .filter((stat) => stat.correct > 0 && stat.box >= 3)
    .sort((a, b) => b.box - a.box || b.correct - a.correct)
    .slice(0, Math.max(0, limit));
}

// --- Mistakes -------------------------------------------------------------------------------

/** How many mistakes one practice session takes on. */
export const PRACTICE_SIZE = 10;

/**
 * Words and phrases the learner has got wrong and not yet mastered, most
 * recently seen first: what "Practise your mistakes" draws on. A word leaves
 * the list once it climbs past the first boxes of review.
 */
export function mistakeItems(stats: readonly ItemStat[]): ItemStat[] {
  return stats
    .filter((stat) => stat.wrong > 0 && stat.box <= 2)
    .sort((a, b) => b.lastSeenAt - a.lastSeenAt);
}

/** Whether a finished lesson went badly enough to suggest doing it again. */
export function shouldRedo(correct: number, total: number): boolean {
  return total > 0 && correct / total < 0.6;
}

// --- Badges -------------------------------------------------------------------------------

/** The longest run of consecutive days with a finished lesson, ever. */
export function longestStreak(completions: readonly number[]): number {
  const days = [...new Set(completions.map(localDay))].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  days.forEach((day, i) => {
    run = i > 0 && day === days[i - 1]! + 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

export const BADGES = [
  'first-day',
  'streak-3',
  'streak-7',
  'streak-30',
  'perfect',
  'chapter',
  'halfway',
  'words-50',
  'words-150',
  'graduate',
] as const;

export type BadgeId = (typeof BADGES)[number];

/** What badges are earned from. All of it is already saved; nothing about badges is. */
export type BadgeFacts = {
  progress: readonly LessonProgress[];
  wordsKnown: number;
  /** The final exam passed. */
  graduated: boolean;
};

const CHECKPOINT_EVERY = 5;

/**
 * The badges earned, in the order they are shown. Worked out from progress
 * every time, so they can never disagree with it, and a reset course starts
 * them again.
 */
export function earnedBadges({ progress, wordsKnown: known, graduated }: BadgeFacts): BadgeId[] {
  const streakBest = longestStreak(progress.map((entry) => entry.completedAt));
  const earned: Record<BadgeId, boolean> = {
    'first-day': progress.length >= 1,
    'streak-3': streakBest >= 3,
    'streak-7': streakBest >= 7,
    'streak-30': streakBest >= 30,
    perfect: progress.some((entry) => entry.stars >= 3),
    chapter: progress.some((entry) => entry.day % CHECKPOINT_EVERY === 0),
    halfway: progress.length >= COURSE_DAYS / 2,
    'words-50': known >= 50,
    'words-150': known >= 150,
    graduate: graduated,
  };
  return BADGES.filter((badge) => earned[badge]);
}

// --- Reminders ------------------------------------------------------------------------------

/** Reminders are planned a week ahead, and planned again each time the app opens. */
export const REMINDER_DAYS = 7;

/**
 * When the next daily reminders go off: at the chosen hour on each of the
 * coming days, but not today once today's lesson is done, or its hour passed.
 */
export function reminderTimes(now: number, hour: number, doneToday: boolean): number[] {
  const today = new Date(now);
  const times: number[] = [];
  for (let offset = 0; times.length < REMINDER_DAYS; offset++) {
    const at = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() + offset,
      hour,
    ).getTime();
    if (offset === 0 && (doneToday || at <= now)) continue;
    times.push(at);
  }
  return times;
}
