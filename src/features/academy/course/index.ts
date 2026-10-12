import { COURSES } from './courses';
import type { Course, CourseChapter, CourseLesson } from './types';

export * from './types';
export { COURSE_DAYS, COURSE_SHAPE, validateChapter } from './validate';

/** Every course this build ships, in the order the app lists them. */
export function availableCourses(): readonly Course[] {
  return COURSES;
}

export function findCourse(courseId: string): Course | undefined {
  return COURSES.find((course) => course.id === courseId);
}

/** The chapters of a course that ship in this build. */
export function courseChapters(courseId: string): readonly CourseChapter[] {
  return findCourse(courseId)?.chapters ?? [];
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
