import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Card, EmptyState, IconButton, Screen, Text } from '@/components';
import { useSpeak } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import { services } from '@/services';
import type { ItemStat } from '@/types';

import { CoachAvatar } from '../components/coach-avatar';
import { Confetti } from '../components/confetti';
import { CountUp } from '../components/motion';
import { ProgressRing } from '../components/progress-ring';
import { QuizPlayer } from '../components/quiz-player';
import type { CourseItem } from '../course';
import { courseItems, finalLesson } from '../course/final';
import { FABALITA } from '../fabalita';
import { useActiveCourse } from '../hooks/use-active-course';
import { itemsOf, planPractice, type LessonStep } from '../lesson/plan';
import { updatedStats, type StepAnswer } from '../lesson/session';
import { PRACTICE_SIZE, mistakeItems } from '../rules';

/** The time of an event, read when it happens. */
const now = () => Date.now();

type Round = { seed: string; ids: readonly string[] };
type Outcome = { right: number; total: number; tricky: readonly CourseItem[] };

/**
 * Practising mistakes: the words and sentences got wrong, each asked twice in
 * two different ways, shuffled. Opened from a lesson's result with that
 * lesson's mistakes, or from the dashboard with every mistake not yet mastered.
 *
 * Every answer updates the word's review record, so what is learned here
 * leaves the mistakes list, and what is still wrong comes back sooner.
 */
export function PracticeScreen() {
  const theme = useTheme();
  const router = useRouter();
  const speak = useSpeak();
  const { ids } = useLocalSearchParams<{ ids?: string }>();
  const { enrollment } = useActiveCourse();
  const courseId = enrollment?.courseId;
  const [round, setRound] = useState<Round>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [busy, setBusy] = useState(false);

  const items = useMemo(() => {
    const map = new Map<string, CourseItem>();
    if (courseId) for (const item of courseItems(courseId)) map.set(item.id, item);
    return map;
  }, [courseId]);

  // The words to practise: the ones handed in, or every mistake not yet mastered.
  useEffect(() => {
    if (courseId)
      services.analytics.log({ name: 'academy_practice_open', params: { course: courseId } });
  }, [courseId]);

  useEffect(() => {
    if (!courseId) return;
    let active = true;
    const given = (ids ?? '').split(',').filter((id) => items.has(id));
    void services.academy.listItemStats(courseId).then((stats) => {
      if (!active) return;
      const chosen = given.length
        ? given
        : mistakeItems(stats.ok ? stats.value : []).map((stat) => stat.itemId);
      setRound({
        seed: `practice:${now()}`,
        ids: chosen.filter((id) => items.has(id)).slice(0, PRACTICE_SIZE),
      });
    });
    return () => {
      active = false;
    };
  }, [courseId, ids, items]);

  const steps = useMemo<LessonStep[]>(
    () =>
      round
        ? planPractice(
            round.ids.map((id) => items.get(id)!),
            [...items.values()],
            round.seed,
          )
        : [],
    [round, items],
  );
  const lesson = useMemo(
    () => (courseId ? finalLesson(courseId, 'practice') : undefined),
    [courseId],
  );

  const close = () => {
    speak.stop();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const finish = async (answers: StepAnswer[]) => {
    if (!courseId) return;
    setBusy(true);
    const at = now();
    const stats = await services.academy.listItemStats(courseId);
    const previous = new Map<string, ItemStat>(
      stats.ok ? stats.value.map((stat) => [stat.itemId, stat]) : [],
    );
    await services.academy.saveItemStats(updatedStats(courseId, steps, answers, previous, at));
    const wrongIds = new Set(
      answers.filter((a) => !a.correct).flatMap((a) => itemsOf(steps[a.step]!)),
    );
    setOutcome({
      right: answers.filter((a) => a.correct).length,
      total: answers.length,
      tricky: [...wrongIds].map((id) => items.get(id)).filter((i): i is CourseItem => !!i),
    });
    setBusy(false);
  };

  const again = (ids: readonly string[]) => {
    setOutcome(undefined);
    setRound({ seed: `practice:${now()}`, ids });
  };

  if (!courseId || !lesson) {
    return (
      <Screen edges={['top', 'bottom']}>
        <EmptyState
          icon="school-outline"
          title={t('Start a course first')}
          onAction={close}
          actionLabel={t('Back')}
        />
      </Screen>
    );
  }

  if (!round || busy) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={theme.colors.aiFrom} />
      </View>
    );
  }

  if (!round.ids.length) {
    return (
      <Screen edges={['top', 'bottom']}>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: theme.spacing.lg }}
        >
          <CoachAvatar size={88} />
          <Text variant="h2" align="center">
            {t('No mistakes to practise')}
          </Text>
          <Text variant="body" color="textSecondary" align="center">
            {t('Every word you got wrong is now well learned. Nice work!')}
          </Text>
          <Button label={t('Back to the course')} fullWidth onPress={close} />
        </View>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        {outcome ? (
          <>
            <View style={{ flexDirection: 'row', padding: theme.spacing.sm }}>
              <IconButton name="close" accessibilityLabel={t('Close')} onPress={close} />
            </View>
            <ScrollView
              contentContainerStyle={{
                padding: theme.layout.screenPadding,
                gap: theme.spacing.lg,
                alignItems: 'center',
              }}
            >
              <CoachAvatar size={72} />
              <Animated.View entering={ZoomIn.springify()}>
                <ProgressRing
                  progress={outcome.total ? outcome.right / outcome.total : 0}
                  size={132}
                  thickness={12}
                  color={outcome.tricky.length ? theme.colors.aiFrom : theme.colors.success}
                  trackColor={theme.colors.surfaceMuted}
                  accessibilityLabel={t('{correct} of {total} right', {
                    correct: outcome.right,
                    total: outcome.total,
                  })}
                >
                  <CountUp
                    value={Math.round((outcome.total ? outcome.right / outcome.total : 0) * 100)}
                    suffix="%"
                    variant="h1"
                  />
                </ProgressRing>
              </Animated.View>
              <Animated.View entering={FadeInDown.delay(200)} style={{ gap: theme.spacing.xs }}>
                <Text variant="h2" align="center">
                  {outcome.tricky.length ? t('Getting there!') : t('All of them right!')}
                </Text>
                <Text variant="body" color="textSecondary" align="center">
                  {outcome.tricky.length
                    ? t('{name} will bring these back in review until they stick.', {
                        name: FABALITA.name,
                      })
                    : t('These words are moving up in your review.')}
                </Text>
              </Animated.View>
              {outcome.tricky.length ? (
                <Card variant="outlined" style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
                  <Text variant="label" color="textSecondary">
                    {t('Still tricky')}
                  </Text>
                  {outcome.tricky.map((item) => (
                    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ flex: 1 }}>
                        <Text variant="body">{item.text}</Text>
                        <Text variant="bodySmall" color="textSecondary">
                          {item.meaning}
                        </Text>
                      </View>
                      <IconButton
                        name="volume-high"
                        accessibilityLabel={t('Listen')}
                        onPress={() => speak.toggle(item.text, courseId)}
                      />
                    </View>
                  ))}
                </Card>
              ) : null}
              <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
                {outcome.tricky.length ? (
                  <Button
                    label={t('Practise these again')}
                    icon="refresh"
                    size="lg"
                    fullWidth
                    onPress={() => again(outcome.tricky.map((item) => item.id))}
                  />
                ) : null}
                <Button
                  label={t('Back to the course')}
                  variant={outcome.tricky.length ? 'secondary' : 'primary'}
                  size="lg"
                  fullWidth
                  onPress={close}
                />
              </View>
            </ScrollView>
            {outcome.tricky.length ? null : <Confetti />}
          </>
        ) : (
          <QuizPlayer
            key={round.seed}
            steps={steps}
            lesson={lesson}
            items={items}
            language={courseId}
            speak={speak}
            leaveLabel={t('Stop practising')}
            onLeave={close}
            onFinish={(answers) => void finish(answers)}
          />
        )}
      </SafeAreaView>
    </View>
  );
}
