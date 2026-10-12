import { isAppLanguage } from '@/i18n';

import { ENGLISH_CHAPTERS } from './en';
import type { BaseLanguage, CourseChapter, CourseLesson, Localized } from './types';
import { BASE_LANGUAGES } from './validate';

export * from './types';
export { BASE_LANGUAGES, COURSE_DAYS, COURSE_SHAPE } from './validate';

/** The chapters of a course that ship in this build. */
export function courseChapters(courseId: string): readonly CourseChapter[] {
  return courseId === 'en' ? ENGLISH_CHAPTERS : [];
}

/** Every lesson of a course, in day order. */
export function courseLessons(courseId: string): readonly CourseLesson[] {
  return courseChapters(courseId).flatMap((chapter) => chapter.lessons);
}

export function findLesson(courseId: string, lessonId: string): CourseLesson | undefined {
  return courseLessons(courseId).find((lesson) => lesson.id === lessonId);
}

export function lessonForDay(courseId: string, day: number): CourseLesson | undefined {
  return courseLessons(courseId).find((lesson) => lesson.day === day);
}

/** Whether a language can be a course's base: an app language other than English. */
export function isBaseLanguage(code: string): code is BaseLanguage {
  return isAppLanguage(code) && BASE_LANGUAGES.includes(code as BaseLanguage);
}

/** A course text in the learner's own language, or the English when it has none. */
export function inBase(text: Localized, base: string, english: string): string {
  return isBaseLanguage(base) ? text[base] || english : english;
}
