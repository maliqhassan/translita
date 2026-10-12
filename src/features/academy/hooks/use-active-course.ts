import { useAcademy } from '@/store';
import type { Enrollment, LessonProgress } from '@/types';

import { findCourse } from '../course';

export type ActiveCourse = {
  /** The course shown: the one opened last that ships in this build. */
  enrollment?: Enrollment;
  progress: readonly LessonProgress[];
  /** Every started course this build can teach, active first. */
  enrolled: readonly Enrollment[];
};

/**
 * Which course the Academy is showing.
 *
 * A started course whose content is not in this build — an earlier test
 * course, or one removed — is passed over rather than shown empty.
 */
export function useActiveCourse(): ActiveCourse {
  const { enrollments, progressOf } = useAcademy();
  const enrolled = enrollments.filter((enrollment) => findCourse(enrollment.courseId));
  const enrollment = enrolled[0];
  return {
    enrollment,
    progress: enrollment ? progressOf(enrollment.courseId) : [],
    enrolled,
  };
}
