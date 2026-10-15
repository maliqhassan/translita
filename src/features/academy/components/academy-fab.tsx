import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Icon, IconButton, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

import { lessonForDay } from '../course';
import { FABALITA } from '../fabalita';
import { useActiveCourse } from '../hooks/use-active-course';
import { useDailyProgress } from '../hooks/use-daily-progress';
import { completedDays, nextDay } from '../rules';

import { CoachAvatar } from './coach-avatar';
import { Breathing, PulseHalo } from './motion';
import { ProgressRing } from './progress-ring';

/** The orb, and the ring of today's progress around it. */
const ORB = 52;
const RING = 64;

/**
 * The Academy home. Typed routes list it as `/academy` or `/academy/index`
 * depending on the generator run; both reach `app/academy/index.tsx`.
 */
const ACADEMY_HOME = '/academy' as Href;

/**
 * The way into the Academy from the translator: the AI coach's orb at the
 * bottom right, and a card above it on the first tap.
 *
 * It asks for attention only while there is something to do: until today's
 * lesson is done it glows and, now and then, nudges. The ring around it fills
 * with today's progress, and a flame shows the streak. A card first rather
 * than straight in, because a round icon on its own does not say what it is.
 *
 * Opening it goes through `openAfterAd` when the screen hands one in: a
 * full-screen (video) ad for the free plan, if one is ready and due, then the
 * Academy. The screen owns the ad, so the translator keeps a single one
 * loaded; with no ad, or a paid plan, Fabalita opens at once.
 */
export function AcademyFab({
  openAfterAd = (open) => open(),
}: {
  openAfterAd?: (open: () => void) => void;
} = {}) {
  const theme = useTheme();
  const router = useRouter();
  const { enrollment, progress } = useActiveCourse();
  const daily = useDailyProgress(enrollment?.courseId, progress);
  const [open, setOpen] = useState(false);

  const day = enrollment ? nextDay(completedDays(progress), enrollment.startDay) : undefined;
  const lesson = enrollment && day ? lessonForDay(enrollment.courseId, day) : undefined;
  const waiting = !enrollment || (day !== undefined && daily.today < 1);
  const percent = Math.round(daily.today * 100);

  const go = () => {
    setOpen(false);
    openAfterAd(() => router.push(ACADEMY_HOME));
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: theme.layout.screenPadding,
        bottom: theme.spacing.base,
        alignItems: 'flex-end',
        gap: theme.spacing.md,
      }}
    >
      {open ? (
        <Animated.View
          entering={FadeInDown.springify().damping(theme.motion.spring.damping)}
          exiting={FadeOutDown.duration(theme.motion.duration.fast)}
          style={{
            width: 296,
            borderRadius: theme.radius.xl,
            overflow: 'hidden',
            backgroundColor: theme.colors.surface,
            borderWidth: theme.layout.borderWidth,
            borderColor: theme.colors.aiBorder,
            ...theme.shadows.lg,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.base,
              backgroundColor: theme.colors.aiFrom,
              experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
            }}
          >
            <CoachAvatar size={40} />
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle" color="onAi">
                {t('Learn with {name}', { name: FABALITA.name })}
              </Text>
              <Text variant="caption" color="onAiMuted">
                {t(FABALITA.tagline)}
              </Text>
            </View>
            <IconButton
              name="close"
              color="onAi"
              accessibilityLabel={t('Close')}
              onPress={() => setOpen(false)}
            />
          </View>

          <View style={{ padding: theme.spacing.base, gap: theme.spacing.md }}>
            {enrollment && day ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
                <ProgressRing
                  progress={daily.today}
                  size={52}
                  thickness={5}
                  color={theme.colors.aiFrom}
                  trackColor={theme.colors.aiMuted}
                  accessibilityLabel={t("Today's goal: {percent}%", { percent })}
                >
                  <Text variant="label" color="aiStrong">{`${percent}%`}</Text>
                </ProgressRing>
                <View style={{ flex: 1, gap: theme.spacing.xxs }}>
                  <Text variant="overline" color="aiStrong">
                    {t('Day {day}', { day })}
                  </Text>
                  <Text variant="rowTitle" numberOfLines={1}>
                    {lesson?.title ?? ''}
                  </Text>
                  {daily.streak > 0 ? (
                    <View
                      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xxs }}
                    >
                      <Icon name="flame" size={14} color="flame" />
                      <Text variant="caption" color="flame">
                        {t('{count}-day streak', { count: daily.streak })}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
            ) : (
              <Text variant="body" color="textSecondary">
                {enrollment
                  ? t('Every day is done. Your final exam is ready.')
                  : t(
                      'Learn a new language from English in 60 days, with an AI coach. Day 1 is free.',
                    )}
              </Text>
            )}

            <Breathing active={waiting}>
              <Pressable
                onPress={go}
                accessibilityRole="button"
                accessibilityLabel={enrollment ? t('Continue learning') : t('Start learning')}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: theme.spacing.sm,
                  minHeight: theme.layout.minTouchTarget + theme.spacing.xs,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.colors.aiFrom,
                  experimental_backgroundImage: `linear-gradient(90deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
                  opacity: pressed ? theme.motion.opacityPressed : 1,
                })}
              >
                <Text variant="button" color="onAi">
                  {enrollment ? t('Continue learning') : t('Start learning')}
                </Text>
                <Icon name="arrow-forward" size={18} color="onAi" />
              </Pressable>
            </Breathing>
          </View>
        </Animated.View>
      ) : null}

      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={t('Learn with {name}', { name: FABALITA.name })}
        accessibilityHint={t('Shows the language courses with an AI coach')}
        style={({ pressed }) => ({
          transform: [{ scale: pressed ? theme.motion.scalePressed : 1 }],
        })}
      >
        <PulseHalo size={RING} color={theme.colors.aiGlow} active={waiting && !open}>
          {enrollment ? (
            <View style={{ position: 'absolute' }}>
              <ProgressRing
                progress={daily.today}
                size={RING}
                thickness={4}
                color={theme.colors.flame}
                trackColor={theme.colors.surface}
              />
            </View>
          ) : null}
          <Orb open={open} nudge={waiting && !open} />
        </PulseHalo>
        {daily.streak > 0 && !open ? (
          <View
            style={{
              position: 'absolute',
              top: -theme.spacing.xs,
              left: -theme.spacing.sm,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 2,
              paddingHorizontal: theme.spacing.sm,
              paddingVertical: 2,
              borderRadius: theme.radius.full,
              backgroundColor: theme.colors.surface,
              borderWidth: theme.layout.borderWidth,
              borderColor: theme.colors.flame,
              ...theme.shadows.sm,
            }}
          >
            <Icon name="flame" size={12} color="flame" />
            <Text variant="caption" color="flame">
              {String(daily.streak)}
            </Text>
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}

/** The coach's orb, which tilts back and forth every few seconds while it waits. */
function Orb({ open, nudge }: { open: boolean; nudge: boolean }) {
  const theme = useTheme();
  const tilt = useSharedValue(0);
  const every = theme.motion.loop.nudgeEvery;
  const step = theme.motion.duration.fast;

  useEffect(() => {
    if (!nudge) {
      cancelAnimation(tilt);
      tilt.set(withTiming(0));
      return;
    }
    tilt.set(
      withRepeat(
        withDelay(
          every,
          withSequence(
            withTiming(-14, { duration: step, easing: Easing.out(Easing.quad) }),
            withTiming(12, { duration: step }),
            withTiming(-8, { duration: step }),
            withTiming(6, { duration: step }),
            withTiming(0, { duration: step }),
          ),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(tilt);
  }, [nudge, tilt, every, step]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${tilt.get()}deg` }] }));

  return (
    <Animated.View
      style={[
        {
          width: ORB,
          height: ORB,
          borderRadius: ORB / 2,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          backgroundColor: theme.colors.aiFrom,
          experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
          ...theme.shadows.md,
        },
        style,
      ]}
    >
      {open ? (
        <Icon name="close" size={24} color="onAi" />
      ) : (
        <Image
          source={FABALITA.image}
          resizeMode="contain"
          style={{ width: ORB * 0.84, height: ORB * 0.84, marginTop: ORB * 0.06 }}
        />
      )}
    </Animated.View>
  );
}
