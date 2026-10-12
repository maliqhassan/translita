import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StatusBar, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeInRight,
  FadeInUp,
  ZoomIn,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, EmptyState, Icon, IconButton, LoadingState, Screen, Text } from '@/components';
import { useSpeak, useSpeechRecognition } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import { services } from '@/services';
import { useAcademy, useIsOffline } from '@/store';
import type { Enrollment, ItemStat } from '@/types';
import { createId } from '@/utils';

import { CoachAvatar } from '../components/coach-avatar';
import { Confetti } from '../components/confetti';
import { CountUp, Pop } from '../components/motion';
import { ProgressRing } from '../components/progress-ring';
import { courseChapters, courseLessons, type CourseItem, type CourseLesson } from '../course';
import { useActiveCourse } from '../hooks/use-active-course';
import { useDailyProgress } from '../hooks/use-daily-progress';
import { planLesson, SECTIONS, sectionCounts, type LessonStep, type Section } from '../lesson/plan';
import type { CoachConnection } from '../lesson/roleplay-step';
import {
  isSessionState,
  outcomeOf,
  updatedStats,
  type LessonOutcome,
  type SessionState,
} from '../lesson/session';
import { LessonStepView, SECTION_LABEL, type SpeechPractice } from '../lesson/steps';

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
  const offline = useIsOffline();

  // --- The AI partner: on the server, so only with a backend and a connection.
  const [coachConfigured, setCoachConfigured] = useState(false);
  useEffect(() => {
    let active = true;
    void services.coach.isAvailable().then((available) => {
      if (active) setCoachConfigured(available);
    });
    return () => {
      active = false;
    };
  }, []);
  const coach: CoachConnection = {
    available: coachConfigured && !offline,
    roleplay: (ask) => services.coach.roleplay(ask),
    addressAs: enrollment.addressAs,
  };

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
      // The length too, so the dashboard can show how far today's lesson is.
      state: { seed: next.seed, reviewIds: next.reviewIds, answers, total: steps.length },
      updatedAt: now(),
    });
  };

  const leave = () => {
    speak.stop();
    router.back();
  };

  // Each step, and the result, starts at the top of the page.
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [session?.index, outcome]);

  if (!session || !steps.length) return <LoadingState />;

  const step = steps[Math.min(session.index, steps.length - 1)]!;
  const progress = Math.min(session.index, steps.length) / steps.length;
  const counts = sectionCounts(steps);
  const inARow = rightInARow(session.answers);

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
          <ProgressBar
            progress={progress}
            label={t('Step {current} of {total}', {
              current: Math.min(session.index + 1, steps.length),
              total: steps.length,
            })}
          />
          {inARow >= 3 && !outcome ? (
            <Animated.View
              key={inARow}
              entering={ZoomIn.springify()}
              accessible
              accessibilityLabel={t('{count} right in a row', { count: inARow })}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 2,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xxs,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.warningMuted,
              }}
            >
              <Icon name="flame" size={14} color="flame" />
              <Text variant="label" color="flame">
                {String(inARow)}
              </Text>
            </Animated.View>
          ) : (
            <Text variant="label" color="textSecondary" style={{ paddingRight: theme.spacing.sm }}>
              {t('Day {day}', { day: lesson.day })}
            </Text>
          )}
        </View>
        {outcome ? null : <SectionBar steps={steps} index={session.index} />}

        <ScrollView
          ref={scroll}
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: theme.layout.screenPadding, gap: theme.spacing.lg }}
        >
          {outcome ? (
            <Result
              courseId={courseId}
              lesson={lesson}
              outcome={outcome}
              onBack={leave}
              onRetry={() => void begin()}
            />
          ) : (
            <Animated.View
              key={`${session.seed}:${session.index}`}
              entering={FadeInRight.duration(theme.motion.duration.slow)}
            >
              <LessonStepView
                step={step}
                lesson={lesson}
                items={allItems}
                language={courseId}
                speak={speak}
                listen={listen}
                coach={coach}
                counts={counts}
                onDone={onDone}
              />
            </Animated.View>
          )}
        </ScrollView>
      </SafeAreaView>
      {outcome?.passed ? <Confetti /> : null}
    </View>
  );
}

/** Right answers in a row, counting back from the latest. */
function rightInARow(answers: Session['answers']): number {
  let count = 0;
  for (let index = answers.length - 1; index >= 0 && answers[index]!.correct; index--) count++;
  return count;
}

/** The lesson's progress, sliding forward with each step. */
function ProgressBar({ progress, label }: { progress: number; label: string }) {
  const theme = useTheme();
  const filled = useSharedValue(progress);

  useEffect(() => {
    filled.set(
      withTiming(progress, {
        duration: theme.motion.duration.slow,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [filled, progress, theme.motion.duration.slow]);

  const style = useAnimatedStyle(() => ({ width: `${filled.get() * 100}%` }));

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={{
        flex: 1,
        height: 12,
        borderRadius: theme.radius.full,
        overflow: 'hidden',
        backgroundColor: theme.colors.surfaceMuted,
      }}
    >
      <Animated.View
        style={[
          {
            height: '100%',
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primary,
            experimental_backgroundImage: `linear-gradient(90deg, ${theme.colors.primary} 0%, ${theme.colors.aiFrom} 100%)`,
          },
          style,
        ]}
      >
        {/* A highlight along the top, so the bar reads as filled rather than flat. */}
        <View
          style={{
            position: 'absolute',
            top: 2,
            left: theme.spacing.sm,
            right: theme.spacing.sm,
            height: 3,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.aiSurface,
          }}
        />
      </Animated.View>
    </View>
  );
}

function Result({
  courseId,
  lesson,
  outcome,
  onBack,
  onRetry,
}: {
  courseId: string;
  lesson: CourseLesson;
  outcome: LessonOutcome;
  onBack: () => void;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const { progress } = useActiveCourse();
  const daily = useDailyProgress(courseId, progress);
  const percent = Math.round(outcome.score * 100);
  const beat = theme.motion.stagger * 4;

  return (
    <View style={{ gap: theme.spacing.lg, alignItems: 'center', paddingTop: theme.spacing.lg }}>
      <CoachAvatar size={64} />

      <View
        accessible
        accessibilityLabel={t('{count} of 3 stars', { count: outcome.stars })}
        style={{ flexDirection: 'row', alignItems: 'flex-end', gap: theme.spacing.sm }}
      >
        {[1, 2, 3].map((star) => (
          <Animated.View
            key={star}
            entering={ZoomIn.delay(beat + star * beat)
              .springify()
              .damping(theme.motion.spring.damping / 2)}
            style={{ marginBottom: star === 2 ? theme.spacing.md : 0 }}
          >
            <Icon
              name={star <= outcome.stars ? 'star' : 'star-outline'}
              size={star === 2 ? 60 : 48}
              color={star <= outcome.stars ? 'flame' : 'textMuted'}
            />
          </Animated.View>
        ))}
      </View>

      <Animated.View entering={FadeInDown.delay(beat * 4)} style={{ gap: theme.spacing.xs }}>
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
      </Animated.View>

      {outcome.total ? (
        <Animated.View entering={ZoomIn.delay(beat * 5).springify()}>
          <ProgressRing
            progress={outcome.score}
            size={132}
            thickness={12}
            color={outcome.passed ? theme.colors.success : theme.colors.danger}
            trackColor={theme.colors.surfaceMuted}
            accessibilityLabel={t('Score: {percent}%', { percent })}
          >
            <CountUp value={percent} suffix="%" variant="h1" />
            <Text variant="caption" color="textSecondary">
              {t('Score')}
            </Text>
          </ProgressRing>
        </Animated.View>
      ) : null}

      {outcome.passed ? (
        <Animated.View entering={FadeInUp.delay(beat * 6)} style={{ alignSelf: 'stretch' }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.base,
              borderRadius: theme.radius.xl,
              backgroundColor: theme.colors.aiFrom,
              experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
            }}
          >
            <ProgressRing
              progress={daily.today}
              size={56}
              thickness={6}
              color={theme.colors.onAi}
              trackColor={theme.colors.aiSurface}
            >
              <Icon name="checkmark" size={24} color="onAi" />
            </ProgressRing>
            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <Text variant="rowTitle" color="onAi">
                {t('Daily goal complete!')}
              </Text>
              {daily.streak > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
                  <Pop active>
                    <Icon name="flame" size={18} color="flame" />
                  </Pop>
                  <Text variant="label" color="onAi">
                    {t('{count}-day streak', { count: daily.streak })}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        </Animated.View>
      ) : (
        <Text variant="body" align="center">
          {t('You need 70% to pass the checkpoint. The words you missed will come back in review.')}
        </Text>
      )}

      <Animated.View
        entering={FadeInUp.delay(beat * 7)}
        style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}
      >
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
      </Animated.View>
    </View>
  );
}

/**
 * The parts of the lesson. Each part's bar fills as its steps are done, and
 * the one the learner is in is named in bold.
 */
function SectionBar({ steps, index }: { steps: readonly LessonStep[]; index: number }) {
  const theme = useTheme();
  const counts = sectionCounts(steps);
  const shown = SECTIONS.filter((section) => counts[section] > 0);
  const current = steps[Math.min(index, steps.length - 1)]?.section;
  const doneIn = (section: Section) =>
    steps.slice(0, index).filter((step) => step.kind !== 'overview' && step.section === section)
      .length;

  return (
    <View
      style={{
        flexDirection: 'row',
        gap: theme.spacing.xs,
        paddingHorizontal: theme.layout.screenPadding,
        paddingTop: theme.spacing.sm,
      }}
    >
      {shown.map((section) => {
        const here = section === current;
        return (
          <View
            key={section}
            accessibilityLabel={t(SECTION_LABEL[section])}
            accessibilityState={{ selected: here }}
            style={{ flex: 1, alignItems: 'center', gap: theme.spacing.xxs }}
          >
            <SectionFill share={doneIn(section) / counts[section]} here={here} />
            <Text
              variant={here ? 'label' : 'caption'}
              color={here ? 'aiStrong' : 'textSecondary'}
              numberOfLines={1}
            >
              {t(SECTION_LABEL[section])}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function SectionFill({ share, here }: { share: number; here: boolean }) {
  const theme = useTheme();
  const filled = useSharedValue(share);

  useEffect(() => {
    filled.set(withTiming(share, { duration: theme.motion.duration.slow }));
  }, [filled, share, theme.motion.duration.slow]);

  const style = useAnimatedStyle(() => ({ width: `${filled.get() * 100}%` }));

  return (
    <View
      style={{
        alignSelf: 'stretch',
        height: here ? 6 : 4,
        borderRadius: theme.radius.full,
        overflow: 'hidden',
        backgroundColor: here ? theme.colors.aiMuted : theme.colors.border,
      }}
    >
      <Animated.View
        style={[
          {
            height: '100%',
            borderRadius: theme.radius.full,
            backgroundColor: share >= 1 ? theme.colors.primary : theme.colors.aiFrom,
          },
          style,
        ]}
      />
    </View>
  );
}
