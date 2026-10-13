import { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';

import { IconButton, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

import type { CourseItem, CourseLesson } from '../course';
import type { LessonStep } from '../lesson/plan';
import type { StepAnswer } from '../lesson/session';
import { LessonStepView, type StepProps } from '../lesson/steps';

import { ProgressBar } from './progress-bar';

/**
 * A run of marked questions, one at a time, with a progress bar and a way
 * out: Part A of the final exam, and practising mistakes.
 *
 * It keeps its own place and hands back every answer at the end. Not saved
 * part-way: each run is short enough to sit in one go.
 */
export function QuizPlayer({
  steps,
  lesson,
  items,
  language,
  speak,
  leaveLabel,
  onLeave,
  onFinish,
}: {
  steps: readonly LessonStep[];
  /** What the step screens read for words to use and voices. */
  lesson: CourseLesson;
  items: ReadonlyMap<string, CourseItem>;
  language: string;
  speak: StepProps['speak'];
  leaveLabel: string;
  onLeave: () => void;
  onFinish: (answers: StepAnswer[]) => void;
}) {
  const theme = useTheme();
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<StepAnswer[]>([]);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    scroll.current?.scrollTo({ y: 0, animated: false });
  }, [index]);

  const step = steps[Math.min(index, steps.length - 1)];
  if (!step) return null;

  const onDone = (correct: boolean | null) => {
    const next = correct === null ? answers : [...answers, { step: index, correct }];
    setAnswers(next);
    if (index + 1 >= steps.length) onFinish(next);
    else setIndex(index + 1);
  };

  return (
    <>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.sm,
          paddingHorizontal: theme.spacing.sm,
          paddingTop: theme.spacing.sm,
        }}
      >
        <IconButton name="close" accessibilityLabel={leaveLabel} onPress={onLeave} />
        <ProgressBar
          progress={index / steps.length}
          label={t('Question {current} of {total}', { current: index + 1, total: steps.length })}
        />
        <Text variant="label" color="textSecondary" style={{ paddingRight: theme.spacing.sm }}>
          {`${index + 1}/${steps.length}`}
        </Text>
      </View>
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: theme.layout.screenPadding, gap: theme.spacing.lg }}
      >
        <Animated.View key={index} entering={FadeInRight.duration(theme.motion.duration.slow)}>
          <LessonStepView
            step={step}
            lesson={lesson}
            items={items}
            language={language}
            speak={speak}
            onDone={onDone}
          />
        </Animated.View>
      </ScrollView>
    </>
  );
}
