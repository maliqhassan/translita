import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, View, type ViewStyle } from 'react-native';

import type { RadiusToken } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

import { Text } from './text';

export type SpinnerProps = { size?: 'small' | 'large' };

export function Spinner({ size = 'small' }: SpinnerProps) {
  const theme = useTheme();
  return <ActivityIndicator size={size} color={theme.colors.primary} />;
}

export type LoadingStateProps = {
  /** Shown under the spinner — keep it to a short, specific phrase. */
  message?: string;
};

/** Full-panel loading state for a screen or card that has nothing to show yet. */
export function LoadingState({ message = t('Loading…') }: LoadingStateProps) {
  const theme = useTheme();
  return (
    <View
      accessibilityRole="progressbar"
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.xl,
      }}
    >
      <Spinner size="large" />
      <Text variant="bodySmall" color="textSecondary">
        {message}
      </Text>
    </View>
  );
}

export type LoadingOverlayProps = {
  visible: boolean;
  message?: string;
};

/** Blocking overlay for actions the user must not interrupt. */
export function LoadingOverlay({ visible, message }: LoadingOverlayProps) {
  const theme = useTheme();
  if (!visible) return null;
  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
        backgroundColor: theme.colors.overlay,
      }}
    >
      <Spinner size="large" />
      {message ? (
        <Text variant="bodySmall" color="textOnPrimary">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export type SkeletonProps = {
  width?: ViewStyle['width'];
  height?: number;
  radius?: RadiusToken;
  style?: ViewStyle;
};

/** Shimmering placeholder used while real content streams in. */
export function Skeleton({ width = '100%', height = 16, radius = 'sm', style }: SkeletonProps) {
  const theme = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          opacity: pulse,
          borderRadius: theme.radius[radius],
          backgroundColor: theme.colors.skeleton,
        },
        style,
      ]}
    />
  );
}
