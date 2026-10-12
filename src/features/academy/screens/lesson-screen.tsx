import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, EmptyState, IconButton, Screen, ScreenHeader, Text } from '@/components';
import { ACADEMY } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import { useAcademy } from '@/store';

import { findLesson, inBase } from '../course';
import { completesDay, starsFor } from '../rules';

/** The time of a tap, read when it happens rather than during a render. */
const now = () => Date.now();

/**
 * One day of the course.
 *
 * For now a preview of the day's words and tip; the lesson player — learn,
 * practise, the AI role-play and review — takes this screen's place next.
 * A development build can mark the day done, to try the dashboard's unlocking
 * before the player exists.
 */
export function LessonScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { enrollment, recordLesson } = useAcademy();
  const lesson = id ? findLesson(ACADEMY.courseId, id) : undefined;
  const base = enrollment?.baseLanguage ?? 'en';

  const header = (
    <ScreenHeader
      title={lesson ? t('Day {day}', { day: lesson.day }) : t('Lesson')}
      subtitle={lesson?.title}
      leading={
        <IconButton
          name="chevron-back-outline"
          accessibilityLabel={t('Back to the course')}
          onPress={() => router.back()}
        />
      }
    />
  );

  if (!lesson) {
    return (
      <Screen header={header} edges={['top', 'bottom']}>
        <EmptyState icon="alert-circle-outline" title={t('This lesson could not be found')} />
      </Screen>
    );
  }

  const finishForTesting = async () => {
    const score = 1;
    if (!completesDay(score, lesson.checkpoint)) return;
    await recordLesson({
      lessonId: lesson.id,
      day: lesson.day,
      score,
      stars: starsFor(score),
      completedAt: now(),
    });
    router.back();
  };

  return (
    <Screen scrollable header={header} edges={['top', 'bottom']}>
      <Text variant="body" color="textSecondary">
        {inBase(lesson.titleMeaning, base, lesson.title)}
      </Text>

      {lesson.items.map((item) => (
        <Card key={item.id} variant="outlined" style={{ gap: theme.spacing.xxs }}>
          <Text variant="rowTitle">{item.text}</Text>
          <Text variant="bodySmall" color="textSecondary">
            {inBase(item.meaning, base, item.text)}
          </Text>
          <Text variant="bodySmall">{item.example}</Text>
        </Card>
      ))}

      {lesson.tip ? (
        <Card variant="glass" style={{ gap: theme.spacing.xs }}>
          <Text variant="label" color="primary">
            {t('Tip')}
          </Text>
          <Text variant="body">{inBase(lesson.tip.explanation, base, lesson.tip.text)}</Text>
        </Card>
      ) : null}

      <View style={{ gap: theme.spacing.sm }}>
        <Text variant="bodySmall" color="textMuted" align="center">
          {t('Exercises, the AI role-play and review are coming in the next update.')}
        </Text>
        {__DEV__ ? (
          <Button
            label="Mark this day done (development build)"
            variant="secondary"
            fullWidth
            onPress={() => void finishForTesting()}
          />
        ) : null}
      </View>
    </Screen>
  );
}
