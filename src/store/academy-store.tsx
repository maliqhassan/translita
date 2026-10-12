import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { ACADEMY } from '@/constants';
import { services, type ServiceResult } from '@/services';
import type { AppError, Enrollment, LessonProgress } from '@/types';
import { ok } from '@/utils';

import { useDatabaseReady } from './database-store';

export type AcademyStatus = 'loading' | 'ready' | 'error';

type AcademyContextValue = {
  status: AcademyStatus;
  error?: AppError;
  /** Null until the user finishes the Academy's onboarding. */
  enrollment: Enrollment | null;
  /** Finished days, in day order. */
  progress: readonly LessonProgress[];
  enroll(enrollment: Enrollment): ServiceResult<void>;
  recordLesson(entry: Omit<LessonProgress, 'attempts' | 'courseId'>): ServiceResult<LessonProgress>;
  /** Starts the course over: removes the enrollment and all progress. */
  reset(): ServiceResult<void>;
};

const AcademyContext = createContext<AcademyContextValue | null>(null);

/**
 * The Academy's progress as React state: the enrollment and finished days.
 *
 * Loaded from the database once it is open — history opens it, then this
 * initialises on the same connection — and reloaded whenever the repository
 * reports a change. The finer state (where in a lesson, how well each word is
 * known) is read by the screens that need it, straight from the repository,
 * rather than held here for every screen to redraw on.
 *
 * Like history, it never blocks the app: the translator works whatever the
 * Academy's storage is doing.
 */
export function AcademyProvider({ children }: { children: ReactNode }) {
  const databaseReady = useDatabaseReady();
  const [status, setStatus] = useState<AcademyStatus>('loading');
  const [error, setError] = useState<AppError>();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [progress, setProgress] = useState<readonly LessonProgress[]>([]);

  const load = useCallback(async () => {
    const courseId = ACADEMY.courseId;
    const [enrolled, done] = await Promise.all([
      services.academy.getEnrollment(courseId),
      services.academy.listProgress(courseId),
    ]);
    if (!enrolled.ok || !done.ok) {
      setError(!enrolled.ok ? enrolled.error : !done.ok ? done.error : undefined);
      setStatus('error');
      return;
    }
    setEnrollment(enrolled.value);
    setProgress(done.value);
    setStatus('ready');
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
      enrollment,
      progress,
      enroll: (next) => services.academy.saveEnrollment(next),
      recordLesson: (entry) =>
        services.academy.recordLesson({ ...entry, courseId: ACADEMY.courseId }),
      reset: async () => {
        const cleared = await services.academy.resetCourse(ACADEMY.courseId);
        return cleared.ok ? ok(undefined) : cleared;
      },
    }),
    [status, error, enrollment, progress],
  );

  return <AcademyContext.Provider value={value}>{children}</AcademyContext.Provider>;
}

export function useAcademy(): AcademyContextValue {
  const context = useContext(AcademyContext);
  if (!context) throw new Error('useAcademy must be used inside <AcademyProvider>.');
  return context;
}
