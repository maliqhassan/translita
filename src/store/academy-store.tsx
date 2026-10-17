import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { academyDayBand, services, type ServiceResult } from '@/services';
import type { AppError, Enrollment, LessonProgress } from '@/types';

import { useDatabaseReady } from './database-store';

export type AcademyStatus = 'loading' | 'ready' | 'error';

type AcademyContextValue = {
  status: AcademyStatus;
  error?: AppError;
  /** Every course started, the one opened most recently first. */
  enrollments: readonly Enrollment[];
  /** Finished days of a course, in day order. */
  progressOf(courseId: string): readonly LessonProgress[];
  enroll(enrollment: Enrollment): ServiceResult<void>;
  /** Makes a started course the one shown. */
  openCourse(courseId: string): ServiceResult<void>;
  recordLesson(
    courseId: string,
    entry: Omit<LessonProgress, 'attempts' | 'courseId'>,
  ): ServiceResult<LessonProgress>;
  /** Starts a course over: removes its enrollment and all its progress. */
  reset(courseId: string): ServiceResult<void>;
};

const AcademyContext = createContext<AcademyContextValue | null>(null);

const NO_PROGRESS: readonly LessonProgress[] = [];

/** The time of a change, read when it happens. */
const now = () => Date.now();

/**
 * The Academy's progress as React state: every course started, and its
 * finished days.
 *
 * Loaded from the database once it is open — history opens it, then this
 * initialises on the same connection — and reloaded whenever the repository
 * reports a change. The finer state (where in a lesson, how well each word is
 * known) is read by the screens that need it, straight from the repository,
 * rather than held here for every screen to redraw on.
 *
 * It knows nothing about which courses ship: that is the Academy feature's to
 * decide (`useActiveCourse`). Like history, it never blocks the app.
 */
export function AcademyProvider({ children }: { children: ReactNode }) {
  const databaseReady = useDatabaseReady();
  const [status, setStatus] = useState<AcademyStatus>('loading');
  const [error, setError] = useState<AppError>();
  const [enrollments, setEnrollments] = useState<readonly Enrollment[]>([]);
  const [progress, setProgress] = useState<Readonly<Record<string, readonly LessonProgress[]>>>({});

  const load = useCallback(async () => {
    const enrolled = await services.academy.listEnrollments();
    if (!enrolled.ok) {
      setError(enrolled.error);
      setStatus('error');
      return;
    }
    const lists = await Promise.all(
      enrolled.value.map((enrollment) => services.academy.listProgress(enrollment.courseId)),
    );
    const byCourse: Record<string, readonly LessonProgress[]> = {};
    for (const [index, list] of lists.entries()) {
      const course = enrolled.value[index]?.courseId;
      if (course && list.ok) byCourse[course] = list.value;
    }
    setEnrollments(enrolled.value);
    setProgress(byCourse);
    setStatus('ready');

    // Who is learning what, and how far: attached to every event, the
    // uninstall Firebase records on its own included.
    const current = enrolled.value[0];
    services.analytics.setUserProperty({
      name: 'academy_course',
      value: current?.courseId ?? 'none',
    });
    services.analytics.setUserProperty({
      name: 'academy_day',
      value: academyDayBand(
        current ? (byCourse[current.courseId]?.length ?? 0) : 0,
        current?.completedAt !== undefined,
      ),
    });
  }, []);

  useEffect(() => {
    if (!databaseReady) return;
    let active = true;
    let unsubscribe: (() => void) | undefined;

    void services.academy.initialize().then(async (initialized) => {
      if (!active) return;
      if (!initialized.ok) {
        setError(initialized.error);
        setStatus('error');
        return;
      }
      await load();
      if (active) unsubscribe = services.academy.subscribe(() => void load());
    });

    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [databaseReady, load]);

  const value = useMemo<AcademyContextValue>(
    () => ({
      status,
      error,
      enrollments,
      progressOf: (courseId) => progress[courseId] ?? NO_PROGRESS,
      enroll: (enrollment) => services.academy.saveEnrollment(enrollment),
      openCourse: (courseId) => services.academy.openCourse(courseId, now()),
      recordLesson: (courseId, entry) => services.academy.recordLesson({ ...entry, courseId }),
      reset: (courseId) => services.academy.resetCourse(courseId),
    }),
    [status, error, enrollments, progress],
  );

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export function useAcademy(): AcademyContextValue {
  const context = useContext(AcademyContext);
  if (!context) throw new Error('useAcademy must be used inside <AcademyProvider>.');
  return context;
}
