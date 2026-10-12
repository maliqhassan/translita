import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks';

/** The lesson's progress, sliding forward with each step. */
export function ProgressBar({ progress, label }: { progress: number; label: string }) {
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
