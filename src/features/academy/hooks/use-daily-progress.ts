import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { services } from '@/services';
import type { LessonPosition, LessonProgress } from '@/types';

import { streak, todayProgress, weekActivity, type SavedPlace, type WeekDay } from '../rules';

export type DailyProgress = {
  /** Today's goal, one lesson, from 0 to 1. */
  today: number;
  /** Consecutive days with a finished lesson. */
  streak: number;
  /** The last seven days, ending today. */
  week: readonly WeekDay[];
  /** The lesson left part-way, if any. */
  resumeLessonId?: string;
};

const EMPTY: DailyProgress = { today: 0, streak: 0, week: [] };

/** The saved place, when it says how long its lesson is. */
function placeOf(position: LessonPosition | null): SavedPlace | undefined {
  if (!position || typeof position.state !== 'object' || position.state === null) return undefined;
  const total = (position.state as { total?: unknown }).total;
  return typeof total === 'number'
    ? { step: position.step, total, updatedAt: position.updatedAt }
    : undefined;
}

/**
 * Today's progress in a course: the daily goal, the streak and the week.
 *
 * Read again each time the screen comes into view, against the clock at that
 * moment: a lesson finished elsewhere, or midnight passing, changes it.
 */
export function useDailyProgress(
  courseId: string | undefined,
  progress: readonly LessonProgress[],
): DailyProgress {
  const [daily, setDaily] = useState<DailyProgress>(EMPTY);

  useFocusEffect(
    useCallback(() => {
      if (!courseId) {
        setDaily(EMPTY);
        return;
      }
      let active = true;
      void services.academy.getPosition(courseId).then((position) => {
        if (!active) return;
        const saved = position.ok ? position.value : null;
        const completions = progress.map((entry) => entry.completedAt);
        const now = Date.now();
        setDaily({
          today: todayProgress(completions, placeOf(saved), now),
          streak: streak(completions, now),
          week: weekActivity(completions, now),
          resumeLessonId: saved?.lessonId,
        });
      });
      return () => {
        active = false;
      };
    }, [courseId, progress]),
  );

  return daily;
}
