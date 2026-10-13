import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import {
  Card,
  EmptyState,
  FlagCircle,
  Icon,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import { services } from '@/services';
import { useAcademy } from '@/store';
import type { Enrollment, ItemStat, LessonProgress } from '@/types';

import { BadgeShelf } from '../components/badges';
import { CoachAvatar } from '../components/coach-avatar';
import { Breathing, CountUp, Floating, Pop, PulseHalo } from '../components/motion';
import { ProgressRing } from '../components/progress-ring';
import { WeekStrip } from '../components/week-strip';
import {
  COURSE_DAYS,
  COURSE_SHAPE,
  courseChapters,
  lessonForDay,
  type CourseChapter,
} from '../course';
import { shippedDays } from '../course/final';
import { FABALITA } from '../fabalita';
import { useAcademyAccess } from '../hooks/use-academy-access';
import { useActiveCourse } from '../hooks/use-active-course';
import { useDailyProgress } from '../hooks/use-daily-progress';
import { ACADEMY_ELITE, ACADEMY_FINAL, ACADEMY_PRACTICE, ACADEMY_REPORT } from '../routes';
import {
  completedDays,
  dayStatus,
  earnedBadges,
  finalUnlocked,
  mistakeItems,
  nextDay,
  wordsKnown,
  type DayStatus,
} from '../rules';

import { AcademyOnboarding } from './academy-onboarding';

/**
 * The Academy: its onboarding the first time, the dashboard after that.
 *
 * One route for both, so there is no redirect to flicker through: the screen
 * shows whichever the saved state calls for, and finishing onboarding swaps
 * it for the dashboard in place.
 *
 * One course at a time. A second language half-started beside the first
 * splits the streak, the daily goal and the attention a beginner needs; to
 * change language, the Academy is reset in Settings and starts again here.
 */
export function AcademyScreen() {
  const router = useRouter();
  const { status } = useAcademy();
  const { enrollment, progress } = useActiveCourse();

  const backToTranslator = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  if (status === 'loading') return <LoadingState />;
  if (status === 'error') {
    return (
      <Screen>
        <EmptyState
          icon="alert-circle-outline"
          title={t('The Academy is unavailable')}
          description={t('Your progress could not be read on this device right now.')}
          actionLabel={t('Back to Translator')}
          onAction={backToTranslator}
        />
      </Screen>
    );
  }
  if (!enrollment) return <AcademyOnboarding onClose={backToTranslator} />;

  return <Dashboard enrollment={enrollment} progress={progress} onBack={backToTranslator} />;
}

function Dashboard({
  enrollment,
  progress,
  onBack,
}: {
  enrollment: Enrollment;
  progress: readonly LessonProgress[];
  onBack: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const unlocked = useAcademyAccess();
  const courseId = enrollment.courseId;
  const daily = useDailyProgress(courseId, progress);
  const [stats, setStats] = useState<readonly ItemStat[]>([]);
  const known = wordsKnown(stats);
  const mistakes = mistakeItems(stats).length;
  const badges = earnedBadges({
    progress,
    wordsKnown: known,
    graduated: enrollment.completedAt !== undefined,
  });

  useEffect(() => {
    services.analytics.log({ name: 'academy_open' });
  }, []);

  // Words known change outside this screen, so they are read again each time
  // it comes back into view.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void services.academy.listItemStats(courseId).then((stats) => {
        if (active && stats.ok) setStats(stats.value);
      });
      return () => {
        active = false;
      };
    }, [courseId]),
  );

  const done = completedDays(progress);
  const upNext = nextDay(done, enrollment.startDay);
  const nextLesson = upNext ? lessonForDay(courseId, upNext) : undefined;
  const chapters = courseChapters(courseId);
  const language = languageName(courseId);
  const starsOf = new Map(progress.map((entry) => [entry.day, entry.stars]));

  const openDay = (day: number, status: DayStatus) => {
    const lesson = lessonForDay(courseId, day);
    if (status === 'locked') {
      Alert.alert(t('Not yet'), t('Finish the day before this one first.'));
      return;
    }
    if (status === 'paywalled') {
      router.push(ACADEMY_ELITE);
      return;
    }
    if (lesson) router.push({ pathname: '/academy/lesson/[id]', params: { id: lesson.id } });
  };

  return (
    <Screen
      scrollable
      wash
      edges={['top', 'bottom']}
      header={
        <ScreenHeader
          title={FABALITA.name}
          subtitle={t('Learn {language}', { language })}
          leading={
            <Pressable
              onPress={onBack}
              accessibilityRole="button"
              accessibilityLabel={t('Back to Translator')}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.md,
                minHeight: theme.layout.minTouchTarget,
                borderRadius: theme.radius.full,
                backgroundColor: pressed ? theme.colors.primaryBorder : theme.colors.primaryMuted,
              })}
            >
              <Icon name="globe-outline" size={18} color="primaryStrong" />
              <Text variant="label" color="primaryStrong">
                {t('Translator')}
              </Text>
            </Pressable>
          }
          actions={<FlagCircle language={courseId} size={32} />}
        />
      }
    >
      <CoachHero
        day={upNext}
        title={nextLesson?.title}
        today={daily.today}
        streakDays={daily.streak}
        resuming={nextLesson !== undefined && daily.resumeLessonId === nextLesson.id}
        onStart={() =>
          upNext && openDay(upNext, dayStatus(upNext, done, enrollment.startDay, unlocked))
        }
      />

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Stat
          index={0}
          icon="flame"
          tint="flame"
          value={daily.streak}
          label={t('Day streak')}
          fill={theme.colors.warningMuted}
        />
        <Stat
          index={1}
          icon="book"
          tint="aiStrong"
          value={known}
          label={t('Words known')}
          fill={theme.colors.aiMuted}
        />
        <Stat
          index={2}
          icon="checkmark-done"
          tint="primary"
          value={done.size}
          label={t('Days of {total}', { total: COURSE_DAYS })}
          fill={theme.colors.primaryMuted}
          share={done.size / COURSE_DAYS}
        />
      </View>

      {mistakes ? (
        <Animated.View entering={FadeInDown.delay(theme.motion.stagger * 3)}>
          <Pressable
            onPress={() => router.push(ACADEMY_PRACTICE)}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.base,
              borderRadius: theme.radius.lg,
              borderWidth: theme.layout.borderWidth,
              borderColor: theme.colors.aiBorder,
              backgroundColor: pressed ? theme.colors.aiMuted : theme.colors.surface,
            })}
          >
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: theme.colors.aiMuted,
              }}
            >
              <Icon name="barbell" size={22} color="aiStrong" />
            </View>
            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <Text variant="rowTitle">{t('Practise your mistakes')}</Text>
              <Text variant="bodySmall" color="textSecondary">
                {t('{count} words and phrases to get right', { count: mistakes })}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color="aiStrong" />
          </Pressable>
        </Animated.View>
      ) : null}

      {daily.week.length ? (
        <Animated.View entering={FadeInDown.delay(theme.motion.stagger * 3)}>
          <Card variant="outlined" style={{ gap: theme.spacing.md }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text variant="rowTitle" style={{ flex: 1 }}>
                {t('This week')}
              </Text>
              <Text variant="label" color="textSecondary">
                {t('{count} of 7 days', {
                  count: daily.week.filter((day) => day.done).length,
                })}
              </Text>
            </View>
            <WeekStrip days={daily.week} />
          </Card>
        </Animated.View>
      ) : null}

      <BadgeShelf earned={badges} />

      {chapters.map((chapter) => (
        <ChapterPath
          key={chapter.id}
          chapter={chapter}
          next={upNext}
          starsOf={starsOf}
          statusOf={(day) => dayStatus(day, done, enrollment.startDay, unlocked)}
          onOpen={openDay}
        />
      ))}

      {chapters.length < COURSE_SHAPE.chapters ? (
        <Text variant="bodySmall" color="textMuted" align="center">
          {t('More chapters are on the way.')}
        </Text>
      ) : null}

      <FinalExamCard
        state={
          enrollment.completedAt
            ? 'complete'
            : // A build still being written opens the exam once its shipped days are done.
              finalUnlocked(done, enrollment.startDay, shippedDays(courseId), __DEV__)
              ? 'ready'
              : 'locked'
        }
        onOpen={(state) => router.push(state === 'complete' ? ACADEMY_REPORT : ACADEMY_FINAL)}
      />
    </Screen>
  );
}

// --- The final exam ------------------------------------------------------------------------

type FinalState = 'locked' | 'ready' | 'complete';

function FinalExamCard({
  state,
  onOpen,
}: {
  state: FinalState;
  onOpen: (state: FinalState) => void;
}) {
  const theme = useTheme();
  const open = state !== 'locked';
  return (
    <Breathing active={state === 'ready'}>
      <Pressable
        disabled={!open}
        onPress={() => onOpen(state)}
        accessibilityRole="button"
        accessibilityState={{ disabled: !open }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.base,
          borderRadius: theme.radius.lg,
          borderWidth: theme.layout.borderWidth,
          borderColor: open ? theme.colors.aiBorder : theme.colors.border,
          backgroundColor: pressed ? theme.colors.aiMuted : theme.colors.surface,
        })}
      >
        <PulseHalo size={48} color={theme.colors.aiGlow} active={state === 'ready'}>
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 24,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: theme.colors.warningMuted,
            }}
          >
            <Icon name={state === 'complete' ? 'trophy' : 'ribbon'} size={26} color="flame" />
          </View>
        </PulseHalo>
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="rowTitle">
            {state === 'complete' ? t('Course complete') : t('Final exam')}
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            {state === 'complete'
              ? t('See your report, your level and your certificate.')
              : state === 'ready'
                ? t('Ready: a written test, then a conversation with {name}.', {
                    name: FABALITA.name,
                  })
                : t(
                    'Opens when all 60 days are done: a test, a conversation with the AI, and your report.',
                  )}
          </Text>
        </View>
        <Icon
          name={open ? 'chevron-forward' : 'lock-closed'}
          size={18}
          color={open ? 'aiStrong' : 'textMuted'}
        />
      </Pressable>
    </Breathing>
  );
}

// --- The coach ------------------------------------------------------------------------

/** What the coach says, from where the learner is today. */
function coachLine({
  day,
  today,
  streakDays,
}: {
  day: number | undefined;
  today: number;
  streakDays: number;
}): string {
  if (day === undefined) return t('Every day is done. Your final exam is ready.');
  if (today >= 1) return t("Today's goal is done! Come back tomorrow to keep your streak going.");
  if (today > 0) {
    return t("You're {percent}% through today's lesson. Let's finish it!", {
      percent: Math.round(today * 100),
    });
  }
  if (streakDays > 0) {
    return t('Keep your {count}-day streak alive with Day {day}.', { count: streakDays, day });
  }
  return t('Ready for Day {day}? I have planned it for you.', { day });
}

function CoachHero({
  day,
  title,
  today,
  streakDays,
  resuming,
  onStart,
}: {
  day: number | undefined;
  title: string | undefined;
  today: number;
  streakDays: number;
  resuming: boolean;
  onStart: () => void;
}) {
  const theme = useTheme();
  const percent = Math.round(today * 100);
  return (
    <Animated.View
      entering={FadeInDown.springify().damping(theme.motion.spring.damping)}
      style={{
        gap: theme.spacing.lg,
        padding: theme.spacing.lg,
        borderRadius: theme.radius.xxl,
        overflow: 'hidden',
        backgroundColor: theme.colors.aiFrom,
        experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
        ...theme.shadows.md,
      }}
    >
      {/* Two soft discs in the corners, for depth. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: -60,
          right: -50,
          width: 180,
          height: 180,
          borderRadius: 90,
          backgroundColor: theme.colors.aiSurface,
        }}
      />
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          bottom: -70,
          left: -40,
          width: 160,
          height: 160,
          borderRadius: 80,
          backgroundColor: theme.colors.aiSurface,
          opacity: 0.6,
        }}
      />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CoachAvatar size={52} />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="overline" color="onAiMuted">
            {FABALITA.name}
          </Text>
          <Text variant="rowTitle" color="onAi">
            {coachLine({ day, today, streakDays })}
          </Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.lg }}>
        <ProgressRing
          progress={today}
          size={96}
          thickness={9}
          color={theme.colors.onAi}
          trackColor={theme.colors.aiSurface}
          accessibilityLabel={t("Today's goal: {percent}%", { percent })}
        >
          <CountUp value={percent} suffix="%" variant="h3" color="onAi" />
          <Text variant="caption" color="onAiMuted">
            {t('Today')}
          </Text>
        </ProgressRing>
        <View style={{ flex: 1, gap: theme.spacing.xs }}>
          {day ? (
            <Text variant="overline" color="onAiMuted">
              {t('Day {day}', { day })}
            </Text>
          ) : null}
          {title ? (
            <Text variant="h3" color="onAi" numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
            <Icon name="flag" size={14} color="onAiMuted" />
            <Text variant="bodySmall" color="onAiMuted">
              {t("Today's goal: one lesson")}
            </Text>
          </View>
        </View>
      </View>

      {day ? (
        <Breathing active={today < 1}>
          <Pressable
            onPress={onStart}
            accessibilityRole="button"
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: theme.spacing.sm,
              minHeight: theme.layout.minTouchTarget + theme.spacing.sm,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.onAi,
              opacity: pressed ? theme.motion.opacityPressed : 1,
              ...theme.shadows.sm,
            })}
          >
            <Icon name={resuming ? 'play-forward' : 'play'} size={20} color="aiFrom" />
            <Text variant="buttonLarge" color="aiFrom">
              {resuming
                ? t('Continue Day {day}', { day })
                : today >= 1
                  ? t('Keep going: Day {day}', { day })
                  : t('Start Day {day}', { day })}
            </Text>
          </Pressable>
        </Breathing>
      ) : null}
    </Animated.View>
  );
}

function Stat({
  index,
  icon,
  tint,
  value,
  label,
  fill,
  share,
}: {
  index: number;
  icon: 'flame' | 'book' | 'checkmark-done';
  tint: 'flame' | 'aiStrong' | 'primary';
  value: number;
  label: string;
  fill: string;
  /** Shown as a thin bar, for a count out of a total. */
  share?: number;
}) {
  const theme = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.delay((index + 1) * theme.motion.stagger).springify()}
      style={{ flex: 1 }}
      accessible
      accessibilityLabel={`${value} ${label}`}
    >
      <Card variant="outlined" style={{ alignItems: 'center', gap: theme.spacing.xs }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: fill,
          }}
        >
          {icon === 'flame' && value > 0 ? (
            <Pop active>
              <Icon name={icon} size={20} color={tint} />
            </Pop>
          ) : (
            <Icon name={icon} size={20} color={tint} />
          )}
        </View>
        <CountUp value={value} variant="h3" />
        <Text variant="caption" color="textSecondary" align="center" numberOfLines={1}>
          {label}
        </Text>
        {share !== undefined ? (
          <View
            style={{
              alignSelf: 'stretch',
              height: 4,
              borderRadius: theme.radius.full,
              overflow: 'hidden',
              backgroundColor: theme.colors.surfaceMuted,
            }}
          >
            <View
              style={{
                width: `${Math.round(Math.min(share, 1) * 100)}%`,
                height: '100%',
                backgroundColor: theme.colors.primary,
              }}
            />
          </View>
        ) : null}
      </Card>
    </Animated.View>
  );
}

// --- The path ---------------------------------------------------------------------------

/** How a day's state is read out. */
const STATUS_LABEL: Record<DayStatus, string> = {
  done: msg('done'),
  open: msg('ready to start'),
  paywalled: msg('part of the full course'),
  locked: msg('locked'),
};

/** How far each day of a chapter sits from the middle: a gentle wave down the page. */
const SWAY = [0, 0.95, 0.6, -0.6, -0.95];
const SWAY_REACH = 64;

function ChapterPath({
  chapter,
  next,
  starsOf,
  statusOf,
  onOpen,
}: {
  chapter: CourseChapter;
  next: number | undefined;
  starsOf: ReadonlyMap<number, number>;
  statusOf: (day: number) => DayStatus;
  onOpen: (day: number, status: DayStatus) => void;
}) {
  const theme = useTheme();
  const finished = chapter.lessons.filter((lesson) => statusOf(lesson.day) === 'done').length;
  return (
    <View style={{ gap: theme.spacing.lg }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.md,
          padding: theme.spacing.md,
          borderRadius: theme.radius.lg,
          backgroundColor: theme.colors.surface,
          borderWidth: theme.layout.borderWidth,
          borderColor: theme.colors.border,
        }}
      >
        <View
          style={{
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.aiMuted,
          }}
        >
          <Text variant="label" color="aiStrong">
            {t('Chapter {number}', { number: chapter.number })}
          </Text>
        </View>
        <Text variant="rowTitle" style={{ flex: 1 }} numberOfLines={1}>
          {chapter.title}
        </Text>
        <Text variant="label" color="textSecondary">
          {`${finished}/${chapter.lessons.length}`}
        </Text>
      </View>

      <View style={{ alignItems: 'center', gap: theme.spacing.lg }}>
        {chapter.lessons.map((lesson, index) => (
          <PathNode
            key={lesson.id}
            index={index}
            day={lesson.day}
            checkpoint={lesson.checkpoint}
            current={lesson.day === next}
            stars={starsOf.get(lesson.day)}
            status={statusOf(lesson.day)}
            onOpen={onOpen}
          />
        ))}
      </View>
    </View>
  );
}

function PathNode({
  index,
  day,
  checkpoint,
  current,
  stars,
  status,
  onOpen,
}: {
  index: number;
  day: number;
  checkpoint: boolean;
  current: boolean;
  /** Undefined for a day placed out of, which has no score. */
  stars: number | undefined;
  status: DayStatus;
  onOpen: (day: number, status: DayStatus) => void;
}) {
  const theme = useTheme();
  const done = status === 'done';
  const playable = current && status === 'open';
  const size = playable ? 72 : 60;
  const icon = done
    ? 'checkmark'
    : status === 'paywalled'
      ? 'diamond'
      : status === 'locked'
        ? 'lock-closed'
        : checkpoint
          ? 'trophy'
          : 'play';

  const face = {
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 5,
    borderColor: done
      ? theme.colors.primaryPressed
      : playable
        ? theme.colors.aiTo
        : status === 'paywalled'
          ? theme.colors.aiBorder
          : theme.colors.borderStrong,
    backgroundColor: done
      ? theme.colors.primary
      : playable
        ? theme.colors.aiFrom
        : status === 'paywalled'
          ? theme.colors.aiMuted
          : theme.colors.surfaceMuted,
    experimental_backgroundImage: playable
      ? `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`
      : undefined,
  } as const;

  return (
    // The sway on a plain view: an entering animation sets its own transform.
    <View style={{ transform: [{ translateX: SWAY[index % SWAY.length]! * SWAY_REACH }] }}>
      <Animated.View
        entering={ZoomIn.delay(index * theme.motion.stagger).springify()}
        style={{ alignItems: 'center', gap: theme.spacing.xs }}
      >
        {playable ? (
          <Floating distance={5}>
            <View
              style={{
                paddingHorizontal: theme.spacing.md,
                paddingVertical: theme.spacing.xs,
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.surface,
                borderWidth: 2,
                borderColor: theme.colors.aiFrom,
                ...theme.shadows.sm,
              }}
            >
              <Text variant="label" color="aiStrong">
                {t('Start Day {day}', { day })}
              </Text>
            </View>
          </Floating>
        ) : null}
        <Pressable
          onPress={() => onOpen(day, status)}
          accessibilityRole="button"
          accessibilityLabel={
            checkpoint
              ? t('Day {day}, checkpoint, {status}', { day, status: t(STATUS_LABEL[status]) })
              : t('Day {day}, {status}', { day, status: t(STATUS_LABEL[status]) })
          }
          style={({ pressed }) => ({
            transform: [{ scale: pressed ? theme.motion.scalePressed : 1 }],
          })}
        >
          <PulseHalo size={size} color={theme.colors.aiGlow} active={playable}>
            <View style={face}>
              <Icon
                name={icon}
                size={playable ? 30 : 24}
                color={
                  done
                    ? 'textOnPrimary'
                    : playable
                      ? 'onAi'
                      : status === 'paywalled'
                        ? 'aiStrong'
                        : 'textMuted'
                }
              />
            </View>
          </PulseHalo>
        </Pressable>
        {done && stars !== undefined ? (
          <View style={{ flexDirection: 'row', gap: 2 }}>
            {[1, 2, 3].map((star) => (
              <Icon
                key={star}
                name={star <= stars ? 'star' : 'star-outline'}
                size={12}
                color={star <= stars ? 'flame' : 'textMuted'}
              />
            ))}
          </View>
        ) : (
          <Text variant="caption" color={playable ? 'aiStrong' : 'textSecondary'}>
            {checkpoint ? t('Checkpoint') : t('Day {day}', { day })}
          </Text>
        )}
      </Animated.View>
    </View>
  );
}
