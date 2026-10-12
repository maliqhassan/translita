import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, Icon, IconButton, LoadingState, Screen, Text } from '@/components';
import { useSpeak, useSpeechRecognition } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import { services } from '@/services';
import { useAcademy } from '@/store';
import type { Enrollment, ItemStat } from '@/types';
import { createId } from '@/utils';

import { courseChapters, courseLessons, type CourseItem, type CourseLesson } from '../course';
import { useActiveCourse } from '../hooks/use-active-course';
import { planLesson } from '../lesson/plan';
import {
  isSessionState,
  outcomeOf,
  updatedStats,
  type LessonOutcome,
  type SessionState,
} from '../lesson/session';
import { LessonStepView, type SpeechPractice } from '../lesson/steps';

/** The time of an event, read when it happens. */
const now = () => Date.now();

/**
 * One day of the course, from the first word to the result.
 *
 * The lesson is planned from a seed, and where the learner is — the seed, the
 * step, the answers so far — is saved after every step. Leaving for the
 * translator, or the app being closed, resumes at the same step of the same
 * lesson. At the end the score, the stars and every word's record are saved,
 * and the saved place is cleared.
 */
export function LessonScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { enrollment } = useActiveCourse();
  const lesson =
    enrollment && id
      ? courseLessons(enrollment.courseId).find((entry) => entry.id === id)
      : undefined;

  if (!enrollment || !lesson) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('This lesson could not be found')}
          actionLabel={t('Back to the course')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }
  return <LessonPlayer key={lesson.id} enrollment={enrollment} lesson={lesson} />;
}

type Session = SessionState & { index: number };

function LessonPlayer({ enrollment, lesson }: { enrollment: Enrollment; lesson: CourseLesson }) {
  const theme = useTheme();
  const router = useRouter();
  const { recordLesson } = useAcademy();
  const speak = useSpeak();
  const courseId = enrollment.courseId;

  // --- Speaking practice, through the app's one recogniser -----------------------------
  const onHeard = useRef<((text: string) => void) | undefined>(undefined);
  const speech = useSpeechRecognition({
    onPartial: () => {},
    onFinal: (text) => onHeard.current?.(text),
  });
  const listen: SpeechPractice = {
    available: speech.status !== 'unavailable' && speech.status !== 'locked',
    listening: speech.listening,
    start: (language, heard) => {
      onHeard.current = heard;
      speech.toggle(language);
    },
    stop: () => speech.toggle(courseId),
  };

  // --- The course around this lesson -----------------------------------------------------
  const allItems = useMemo(() => {
    const map = new Map<string, CourseItem>();
    for (const entry of courseLessons(courseId)) {
      for (const item of entry.items) map.set(item.id, item);
    }
    return map;
  }, [courseId]);

  /** This chapter's items, and everything taught before this day. */
  const { chapterItems, pool } = useMemo(() => {
    const chapter = courseChapters(courseId).find((entry) =>
      entry.lessons.some((day) => day.id === lesson.id),
    );
    const inChapter = chapter?.lessons.flatMap((day) => day.items) ?? [];
    const earlier = courseLessons(courseId)
      .filter((day) => day.day < lesson.day)
      .flatMap((day) => day.items);
    const merged = new Map([...earlier, ...inChapter].map((item) => [item.id, item]));
    return { chapterItems: inChapter, pool: [...merged.values()] };
  }, [courseId, lesson]);

  // --- Starting or resuming ---------------------------------------------------------------
  const [session, setSession] = useState<Session>();
  const [outcome, setOutcome] = useState<LessonOutcome>();

  const begin = useCallback(async () => {
    const due = await services.academy.listDueItems(courseId, now(), 8);
    const todays = new Set(lesson.items.map((item) => item.id));
    const reviewIds = due.ok
      ? due.value
          .map((stat) => stat.itemId)
          .filter((itemId) => allItems.has(itemId) && !todays.has(itemId))
      : [];
    setOutcome(undefined);
    setSession({ seed: `${lesson.id}:${now()}`, reviewIds, answers: [], index: 0 });
  }, [courseId, lesson, allItems]);

  useEffect(() => {
    let active = true;
    void services.academy.getPosition(courseId).then((position) => {
      if (!active) return;
      const saved = position.ok ? position.value : null;
      if (saved && saved.lessonId === lesson.id && isSessionState(saved.state)) {
        setSession({ ...saved.state, index: saved.step });
      } else {
        void begin();
      }
    });
    return () => {
      active = false;
    };
  }, [courseId, lesson.id, begin]);

  const steps = useMemo(
    () =>
      session
        ? planLesson({
            lesson,
            pool: lesson.checkpoint ? chapterItems : pool,
            review: session.reviewIds
              .map((itemId) => allItems.get(itemId))
              .filter((item): item is CourseItem => Boolean(item)),
            minutesPerDay: enrollment.minutesPerDay,
            seed: session.seed,
          })
        : [],
    // The plan is fixed by its seed; nothing else may change it mid-lesson.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session?.seed],
  );

  // --- Moving on --------------------------------------------------------------------------
  const finish = async (answers: Session['answers']) => {
    speak.stop();
    const result = outcomeOf(answers, lesson.checkpoint);
    const at = now();

    const stats = await services.academy.listItemStats(courseId);
    const previous = new Map<string, ItemStat>(
      stats.ok ? stats.value.map((stat) => [stat.itemId, stat]) : [],
    );
    await services.academy.saveItemStats(updatedStats(courseId, steps, answers, previous, at));

    if (result.passed) {
      await recordLesson(courseId, {
        lessonId: lesson.id,
        day: lesson.day,
        score: result.score,
        stars: result.stars,
        completedAt: at,
      });
    }
    if (lesson.checkpoint) {
      await services.academy.addResult({
        id: createId('r'),
        courseId,
        kind: 'checkpoint',
        lessonId: lesson.id,
        score: result.score,
        passed: result.passed,
        createdAt: at,
      });
    }
    await services.academy.clearPosition(courseId);
    setOutcome(result);
  };

  const onDone = (correct: boolean | null) => {
    if (!session) return;
    const answers =
      correct === null ? session.answers : [...session.answers, { step: session.index, correct }];
    const index = session.index + 1;
    if (index >= steps.length) {
      setSession({ ...session, answers, index });
      void finish(answers);
      return;
    }
    const next = { ...session, answers, index };
    setSession(next);
    // Saved after every step, so leaving now resumes here.
    void services.academy.savePosition({
      courseId,
      lessonId: lesson.id,
      step: index,
      state: { seed: next.seed, reviewIds: next.reviewIds, answers },
      updatedAt: now(),
    });
  };

  const leave = () => {
    speak.stop();
    router.back();
  };

  if (!session || !steps.length) return <LoadingState />;

  const step = steps[Math.min(session.index, steps.length - 1)]!;
  const progress = Math.min(session.index, steps.length) / steps.length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.sm,
            paddingHorizontal: theme.spacing.sm,
            paddingTop: theme.spacing.sm,
          }}
        >
          <IconButton
            name="close"
            accessibilityLabel={t('Leave the lesson. Your place is saved.')}
            onPress={leave}
          />
          <View
            accessibilityRole="progressbar"
            accessibilityLabel={t('Step {current} of {total}', {
              current: Math.min(session.index + 1, steps.length),
              total: steps.length,
            })}
            style={{
              flex: 1,
              height: 10,
              borderRadius: theme.radius.full,
              overflow: 'hidden',
              backgroundColor: theme.colors.primaryMuted,
            }}
          >
            <View
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: '100%',
                backgroundColor: theme.colors.primary,
              }}
            />
          </View>
          <Text variant="label" color="textSecondary" style={{ paddingRight: theme.spacing.sm }}>
            {t('Day {day}', { day: lesson.day })}
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.layout.screenPadding, gap: theme.spacing.lg }}
        >
          {outcome ? (
            <Result lesson={lesson} outcome={outcome} onBack={leave} onRetry={() => void begin()} />
          ) : (
            <LessonStepView
              key={`${session.seed}:${session.index}`}
              step={step}
              lesson={lesson}
              items={allItems}
              language={courseId}
              speak={speak}
              listen={listen}
              onDone={onDone}
            />
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function Result({
  lesson,
  outcome,
  onBack,
  onRetry,
}: {
  lesson: CourseLesson;
  outcome: LessonOutcome;
  onBack: () => void;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const percent = Math.round(outcome.score * 100);
  return (
    <View style={{ gap: theme.spacing.lg, alignItems: 'center', paddingTop: theme.spacing.xl }}>
      <View
        accessible
        accessibilityLabel={t('{count} of 3 stars', { count: outcome.stars })}
        style={{ flexDirection: 'row', gap: theme.spacing.sm }}
      >
        {[1, 2, 3].map((star) => (
          <Icon
            key={star}
            name={star <= outcome.stars ? 'star' : 'star-outline'}
            size={44}
            color={star <= outcome.stars ? 'warning' : 'textMuted'}
          />
        ))}
      </View>
      <Text variant="h1" align="center">
        {outcome.passed
          ? lesson.checkpoint
            ? t('Checkpoint passed!')
            : t('Day {day} complete!', { day: lesson.day })
          : t('Not quite yet')}
      </Text>
      <Text variant="bodyLarge" color="textSecondary" align="center">
        {outcome.total
          ? t('{correct} of {total} right ({percent}%)', {
              correct: outcome.correct,
              total: outcome.total,
              percent,
            })
          : t('Well done.')}
      </Text>
      {!outcome.passed ? (
        <Text variant="body" align="center">
          {t('You need 70% to pass the checkpoint. The words you missed will come back in review.')}
        </Text>
      ) : null}
      <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
        {!outcome.passed ? (
          <Button label={t('Try again')} size="lg" fullWidth onPress={onRetry} />
        ) : null}
        <Button
          label={t('Back to the course')}
          variant={outcome.passed ? 'primary' : 'secondary'}
          size="lg"
          fullWidth
          onPress={onBack}
        />
      </View>
    </View>
  );
}
