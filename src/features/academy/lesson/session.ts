import type { ItemStat } from '@/types';

import { answer, completesDay, starsFor } from '../rules';

import { isGraded, itemsOf, type LessonStep } from './plan';

/** One marked answer: which step, and whether it was right. */
export type StepAnswer = { step: number; correct: boolean };

/**
 * A lesson in progress, as saved after every step: enough to rebuild the
 * exact same lesson and carry on from where the learner left it.
 */
export type SessionState = {
  seed: string;
  /** The review words chosen when the lesson began, so a resume asks the same ones. */
  reviewIds: readonly string[];
  answers: readonly StepAnswer[];
};

export function isSessionState(value: unknown): value is SessionState {
  if (typeof value !== 'object' || value === null) return false;
  const state = value as Record<string, unknown>;
  return (
    typeof state.seed === 'string' &&
    Array.isArray(state.reviewIds) &&
    state.reviewIds.every((id) => typeof id === 'string') &&
    Array.isArray(state.answers) &&
    state.answers.every(
      (entry: unknown) =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as StepAnswer).step === 'number' &&
        typeof (entry as StepAnswer).correct === 'boolean',
    )
  );
}

export type LessonOutcome = {
  /** 0–1 over the marked steps; 1 when nothing was marked. */
  score: number;
  stars: number;
  /** Whether the day is done: always for a learning day, at 70% for a checkpoint. */
  passed: boolean;
  correct: number;
  total: number;
};

export function outcomeOf(answers: readonly StepAnswer[], checkpoint: boolean): LessonOutcome {
  const correct = answers.filter((entry) => entry.correct).length;
  const total = answers.length;
  const score = total ? correct / total : 1;
  return { score, stars: starsFor(score), passed: completesDay(score, checkpoint), correct, total };
}

/**
 * Every word's record after the lesson's answers, applied in order. Only
 * marked steps count; meeting a word is not knowing it.
 */
export function updatedStats(
  courseId: string,
  steps: readonly LessonStep[],
  answers: readonly StepAnswer[],
  previous: ReadonlyMap<string, ItemStat>,
  now: number,
): ItemStat[] {
  const stats = new Map(previous);
  for (const entry of answers) {
    const step = steps[entry.step];
    if (!step || !isGraded(step)) continue;
    for (const itemId of itemsOf(step)) {
      stats.set(itemId, answer(stats.get(itemId), { courseId, itemId }, entry.correct, now));
    }
  }
  return [...stats.values()].filter((stat) => {
    const before = previous.get(stat.itemId);
    return !before || before.lastSeenAt !== stat.lastSeenAt || before.box !== stat.box;
  });
}
