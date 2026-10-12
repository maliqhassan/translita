import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, View } from 'react-native';

import {
  Button,
  Card,
  EmptyState,
  Icon,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { ACADEMY } from '@/constants';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import { services } from '@/services';
import { useAcademy } from '@/store';
import type { Enrollment, LessonProgress } from '@/types';

import {
  COURSE_DAYS,
  COURSE_SHAPE,
  courseChapters,
  inBase,
  lessonForDay,
  type CourseChapter,
} from '../course';
import { useAcademyAccess } from '../hooks/use-academy-access';
import { completedDays, dayStatus, nextDay, streak, wordsKnown, type DayStatus } from '../rules';

import { AcademyOnboarding } from './academy-onboarding';

/**
 * The Academy: its onboarding the first time, its dashboard after that.
 *
 * One route for both, so there is no redirect to flicker through: the screen
 * shows whichever the saved state calls for, and finishing onboarding swaps
 * it for the dashboard in place.
 */
export function AcademyScreen() {
  const router = useRouter();
  const { status, enrollment, progress } = useAcademy();

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
  const [known, setKnown] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [resumeLesson, setResumeLesson] = useState<string>();

  // Words known and an unfinished lesson change outside this screen, so they
  // are read again each time it comes back into view.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void Promise.all([
        services.academy.listItemStats(ACADEMY.courseId),
        services.academy.getPosition(ACADEMY.courseId),
      ]).then(([stats, position]) => {
        if (!active) return;
        if (stats.ok) setKnown(wordsKnown(stats.value));
        // Read against the clock as the screen appears, not on every render.
        setStreakDays(
          streak(
            progress.map((entry) => entry.completedAt),
            Date.now(),
          ),
        );
        setResumeLesson(position.ok ? position.value?.lessonId : undefined);
      });
      return () => {
        active = false;
      };
    }, [progress]),
  );

  const done = completedDays(progress);
  const upNext = nextDay(done, enrollment.startDay);
  const nextLesson = upNext ? lessonForDay(ACADEMY.courseId, upNext) : undefined;
  const chapters = courseChapters(ACADEMY.courseId);
  const base = enrollment.baseLanguage;

  const openDay = (day: number, status: DayStatus) => {
    const lesson = lessonForDay(ACADEMY.courseId, day);
    if (status === 'locked') {
      Alert.alert(t('Not yet'), t('Finish the day before this one first.'));
      return;
    }
    if (status === 'paywalled') {
      Alert.alert(
        t('Unlock the full course'),
        t('Day 1 is free. The full 60-day course with the AI coach comes with Translita Elite.'),
      );
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
          title={t('AI Academy')}
          subtitle={t('Learn English')}
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
        />
      }
    >
      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Stat icon="flame" value={streakDays} label={t('Day streak')} />
        <Stat icon="book" value={known} label={t('Words known')} />
        <Stat
          icon="checkmark-done"
          value={done.size}
          label={t('Days of {total}', { total: COURSE_DAYS })}
        />
      </View>

      {nextLesson && upNext ? (
        <Card variant="glass" style={{ gap: theme.spacing.md }}>
          <View style={{ gap: theme.spacing.xxs }}>
            <Text variant="overline" color="primary">
              {resumeLesson === nextLesson.id
                ? t('Continue Day {day}', { day: upNext })
                : t('Day {day}', { day: upNext })}
            </Text>
            <Text variant="h2">{nextLesson.title}</Text>
            <Text variant="body" color="textSecondary">
              {inBase(nextLesson.titleMeaning, base, nextLesson.title)}
            </Text>
          </View>
          <Button
            label={resumeLesson === nextLesson.id ? t('Continue') : t('Start lesson')}
            icon="arrow-forward"
            iconPosition="right"
            fullWidth
            onPress={() => openDay(upNext, dayStatus(upNext, done, enrollment.startDay, unlocked))}
          />
        </Card>
      ) : null}

      {chapters.map((chapter) => (
        <ChapterCard
          key={chapter.id}
          chapter={chapter}
          base={base}
          statusOf={(day) => dayStatus(day, done, enrollment.startDay, unlocked)}
          onOpen={openDay}
        />
      ))}

      {chapters.length < COURSE_SHAPE.chapters ? (
        <Text variant="bodySmall" color="textMuted" align="center">
          {t('More chapters are on the way.')}
        </Text>
      ) : null}

      <Card
        variant="outlined"
        style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}
      >
        <Icon name="ribbon-outline" size={28} color="textMuted" />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="rowTitle">{t('Final exam')}</Text>
          <Text variant="bodySmall" color="textSecondary">
            {t(
              'Opens when all 60 days are done: a test, a conversation with the AI, and your report.',
            )}
          </Text>
        </View>
        <Icon name="lock-closed" size={18} color="textMuted" />
      </Card>
    </Screen>
  );
}

function Stat({
  icon,
  value,
  label,
}: {
  icon: 'flame' | 'book' | 'checkmark-done';
  value: number;
  label: string;
}) {
  const theme = useTheme();
  return (
    <View style={{ flex: 1 }} accessible accessibilityLabel={`${value} ${label}`}>
      <Card variant="outlined" style={{ alignItems: 'center', gap: theme.spacing.xxs }}>
        <Icon name={icon} size={20} color="primary" />
        <Text variant="h3">{String(value)}</Text>
        <Text variant="caption" color="textSecondary" align="center">
          {label}
        </Text>
      </Card>
    </View>
  );
}

/** How a day's state is read out. */
const STATUS_LABEL: Record<DayStatus, string> = {
  done: msg('done'),
  open: msg('ready to start'),
  paywalled: msg('part of the full course'),
  locked: msg('locked'),
};

const DAY_ICON: Record<DayStatus, 'checkmark' | 'play' | 'lock-closed'> = {
  done: 'checkmark',
  open: 'play',
  paywalled: 'lock-closed',
  locked: 'lock-closed',
};

function ChapterCard({
  chapter,
  base,
  statusOf,
  onOpen,
}: {
  chapter: CourseChapter;
  base: string;
  statusOf: (day: number) => DayStatus;
  onOpen: (day: number, status: DayStatus) => void;
}) {
  const theme = useTheme();
  return (
    <Card variant="outlined" style={{ gap: theme.spacing.md }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="overline" color="textSecondary">
          {t('Chapter {number}', { number: chapter.number })}
        </Text>
        <Text variant="rowTitle">{chapter.title}</Text>
        <Text variant="bodySmall" color="textSecondary">
          {inBase(chapter.titleMeaning, base, chapter.title)}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {chapter.lessons.map((lesson) => {
          const status = statusOf(lesson.day);
          const done = status === 'done';
          const open = status === 'open';
          return (
            <Pressable
              key={lesson.id}
              onPress={() => onOpen(lesson.day, status)}
              accessibilityRole="button"
              accessibilityLabel={
                lesson.checkpoint
                  ? t('Day {day}, checkpoint, {status}', {
                      day: lesson.day,
                      status: t(STATUS_LABEL[status]),
                    })
                  : t('Day {day}, {status}', { day: lesson.day, status: t(STATUS_LABEL[status]) })
              }
              style={{ alignItems: 'center', gap: theme.spacing.xxs }}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: theme.layout.borderWidth,
                  borderColor: done || open ? theme.colors.primary : theme.colors.border,
                  backgroundColor: done
                    ? theme.colors.primary
                    : open
                      ? theme.colors.primaryMuted
                      : theme.colors.surfaceMuted,
                }}
              >
                <Icon
                  name={lesson.checkpoint && !done ? 'trophy' : DAY_ICON[status]}
                  size={18}
                  color={done ? 'textOnPrimary' : open ? 'primary' : 'textMuted'}
                />
              </View>
              <Text variant="caption" color={open ? 'primary' : 'textSecondary'}>
                {String(lesson.day)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}
