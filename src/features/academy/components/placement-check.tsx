import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInDown, ZoomIn } from 'react-native-reanimated';

import { Button, Card, Icon, Text } from '@/components';
import { useSpeak } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

import { courseChapters, type CourseItem } from '../course';
import { COURSE_DAYS } from '../course';
import { finalLesson } from '../course/final';
import { FABALITA } from '../fabalita';
import { itemsOf, planPlacement } from '../lesson/plan';
import type { StepAnswer } from '../lesson/session';
import { chapterOfItem, placementStart } from '../rules';

import { CoachAvatar } from './coach-avatar';
import { QuizPlayer } from './quiz-player';

/** The time of an event, read when it happens. */
const now = () => Date.now();

const DAYS_PER_CHAPTER = 5;

/**
 * The placement check, for someone who already knows some of the language:
 * one question from each chapter, easiest first. Fabalita then suggests where
 * to start, and the learner chooses — the suggestion, or Day 1 anyway.
 *
 * Nothing is saved here: the chosen day goes back to the onboarding, which
 * saves it with the rest of the answers.
 */
export function PlacementCheck({
  courseId,
  onDone,
  onBack,
}: {
  courseId: string;
  /** The day chosen to start on: 1, or the one suggested. */
  onDone: (startDay: number) => void;
  onBack: () => void;
}) {
  const theme = useTheme();
  const speak = useSpeak();
  const [phase, setPhase] = useState<'intro' | 'check' | 'result'>('intro');
  const [seed, setSeed] = useState('');
  const [suggested, setSuggested] = useState(1);

  const chapters = courseChapters(courseId);
  const items = useMemo(() => {
    const map = new Map<string, CourseItem>();
    for (const chapter of chapters) {
      for (const lesson of chapter.lessons) for (const item of lesson.items) map.set(item.id, item);
    }
    return map;
  }, [chapters]);
  const steps = useMemo(
    () =>
      seed
        ? planPlacement(
            chapters.map((chapter) => ({
              number: chapter.number,
              items: chapter.lessons.flatMap((lesson) => lesson.items),
            })),
            seed,
          )
        : [],
    [chapters, seed],
  );

  const finish = (answers: StepAnswer[]) => {
    const results = answers.map((answer) => ({
      chapter: chapterOfItem(itemsOf(steps[answer.step]!)[0] ?? 'c01'),
      correct: answer.correct,
    }));
    setSuggested(placementStart(results));
    setPhase('result');
  };

  if (phase === 'check') {
    return (
      <QuizPlayer
        steps={steps}
        lesson={finalLesson(courseId, 'placement')}
        items={items}
        language={courseId}
        speak={speak}
        leaveLabel={t('Stop the check')}
        onLeave={() => setPhase('intro')}
        onFinish={finish}
      />
    );
  }

  const startChapter = Math.floor((suggested - 1) / DAYS_PER_CHAPTER) + 1;
  const chapter = chapters.find((entry) => entry.number === startChapter);

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        padding: theme.layout.screenPadding,
        gap: theme.spacing.lg,
      }}
    >
      <View style={{ alignItems: 'center' }}>
        <CoachAvatar size={88} />
      </View>

      {phase === 'intro' ? (
        <Animated.View entering={FadeInDown.springify()} style={{ gap: theme.spacing.lg }}>
          <View style={{ gap: theme.spacing.xs }}>
            <Text variant="h1" align="center">
              {t('Let’s find your level')}
            </Text>
            <Text variant="bodyLarge" color="textSecondary" align="center">
              {t(
                '{count} quick questions, from first words to harder ones. About 3 minutes. {name} will suggest where to start.',
                { count: chapters.length, name: FABALITA.name },
              )}
            </Text>
          </View>
          <Button
            label={t('Start the check')}
            icon="arrow-forward"
            iconPosition="right"
            size="lg"
            fullWidth
            onPress={() => {
              setSeed(`placement:${now()}`);
              setPhase('check');
            }}
          />
          <Button
            label={t('Skip, start from Day 1')}
            variant="ghost"
            fullWidth
            onPress={() => onDone(1)}
          />
          <Button label={t('Back')} variant="ghost" fullWidth onPress={onBack} />
        </Animated.View>
      ) : (
        <Animated.View entering={ZoomIn.springify()} style={{ gap: theme.spacing.lg }}>
          {suggested > 1 && chapter ? (
            <>
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="h1" align="center">
                  {t('You already know a lot!')}
                </Text>
                <Text variant="bodyLarge" color="textSecondary" align="center">
                  {t('{name} suggests you start at Chapter {number}.', {
                    name: FABALITA.name,
                    number: startChapter,
                  })}
                </Text>
              </View>
              <Card variant="outlined" style={{ gap: theme.spacing.xs, alignItems: 'center' }}>
                <Icon name="flag" size={24} color="aiStrong" />
                <Text variant="overline" color="aiStrong">
                  {t('Chapter {number}', { number: startChapter })}
                </Text>
                <Text variant="h3" align="center">
                  {chapter.title}
                </Text>
                <Text variant="bodySmall" color="textSecondary" align="center">
                  {t('Days 1 to {day} count as done. {left} days to go.', {
                    day: suggested - 1,
                    left: COURSE_DAYS - suggested + 1,
                  })}
                </Text>
              </Card>
              <Button
                label={t('Start at Chapter {number}', { number: startChapter })}
                size="lg"
                fullWidth
                onPress={() => onDone(suggested)}
              />
              <Button
                label={t('Start from Day 1 instead')}
                variant="ghost"
                fullWidth
                onPress={() => onDone(1)}
              />
            </>
          ) : (
            <>
              <View style={{ gap: theme.spacing.xs }}>
                <Text variant="h1" align="center">
                  {t('Let’s start from the beginning')}
                </Text>
                <Text variant="bodyLarge" color="textSecondary" align="center">
                  {t('You will fly through the parts you know, and fill in the gaps.')}
                </Text>
              </View>
              <Button label={t('Continue')} size="lg" fullWidth onPress={() => onDone(1)} />
            </>
          )}
        </Animated.View>
      )}
    </ScrollView>
  );
}
