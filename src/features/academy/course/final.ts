import { seededRandom, shuffle } from '../lesson/plan';

import type { CourseItem, CourseLesson, Scenario } from './types';
import { COURSE_DAYS } from './validate';

import { courseLessons } from './index';

/**
 * The final exam's conversation: one scene that reaches across the course —
 * meeting someone, food, getting around, times and plans — so the learner can
 * show all of it in one go. All in English, like every scenario.
 */
export const FINAL_SCENE: Scenario = {
  partnerRole: 'a friendly local the learner has just met while travelling',
  learnerRole: 'a visitor spending a day in town',
  brief:
    'Get to know the learner, then plan a day out together: where to eat, how to get there and what time to meet. Ask one question at a time, about different everyday topics, and react to their answers naturally.',
  goal: 'Introduce yourself, then agree on a plan for the day: a place to eat, how to get there and a time to meet.',
};

/** Every word the course teaches, for the exam's questions. */
export function courseItems(courseId: string): CourseItem[] {
  return courseLessons(courseId).flatMap((lesson) => lesson.items);
}

/**
 * The exam, shaped as a lesson so the lesson's screens can show it: the scene
 * above, and a dozen words from across the course for the partner to use.
 */
export function finalLesson(courseId: string, seed: string): CourseLesson {
  return {
    id: 'final',
    day: COURSE_DAYS + 1,
    title: 'Final exam',
    checkpoint: true,
    items: shuffle(courseItems(courseId), seededRandom(`${seed}:words`)).slice(0, 12),
    dialogue: [],
    scenario: FINAL_SCENE,
  };
}

/** How many days this build ships of a course: all 60 once it is complete. */
export const shippedDays = (courseId: string): number => courseLessons(courseId).length;
