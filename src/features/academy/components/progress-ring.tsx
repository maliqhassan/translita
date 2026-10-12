import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks';

/**
 * A ring that fills clockwise from the top, with anything in its middle.
 *
 * Drawn from plain views, so no drawing library is involved: each half of the
 * circle is a clip, and inside it a half-ring turns into view. The right half
 * covers the first 180 degrees, the left half the rest. The middle stays
 * clear, so the ring sits on any background, gradients included.
 */
export function ProgressRing({
  progress,
  size,
  thickness,
  color,
  trackColor,
  children,
  accessibilityLabel,
}: {
  /** 0 to 1. */
  progress: number;
  size: number;
  thickness: number;
  color: string;
  trackColor: string;
  children?: ReactNode;
  accessibilityLabel?: string;
}) {
  const theme = useTheme();
  const filled = useSharedValue(0);
  const half = size / 2;

  useEffect(() => {
    filled.set(
      withTiming(Math.min(Math.max(progress, 0), 1), {
        duration: theme.motion.duration.long,
        easing: Easing.out(Easing.cubic),
      }),
    );
  }, [filled, progress, theme.motion.duration.long]);

  const first = useAnimatedStyle(() => ({
    opacity: filled.get() > 0.001 ? 1 : 0,
    transform: [{ rotate: `${Math.min(filled.get(), 0.5) * 360}deg` }],
  }));
  const second = useAnimatedStyle(() => ({
    opacity: filled.get() > 0.5 ? 1 : 0,
    transform: [{ rotate: `${Math.max(filled.get() - 0.5, 0) * 360}deg` }],
  }));

  const ring = {
    width: size,
    height: size,
    borderRadius: half,
    borderWidth: thickness,
    borderColor: color,
  } as const;

  return (
    <View
      accessible={accessibilityLabel !== undefined}
      accessibilityRole={accessibilityLabel ? 'progressbar' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={{ width: size, height: size }}
    >
      <View style={{ ...ring, position: 'absolute', borderColor: trackColor }} />

      {/* The right half: a left-hand half-ring turning in from the top. */}
      <View
        style={{
          position: 'absolute',
          left: half,
          width: half,
          height: size,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[{ position: 'absolute', left: -half, width: size, height: size }, first]}
        >
          <View style={{ width: half, height: size, overflow: 'hidden' }}>
            <View style={ring} />
          </View>
        </Animated.View>
      </View>

      {/* The left half: a right-hand half-ring turning in from the bottom. */}
      <View style={{ position: 'absolute', width: half, height: size, overflow: 'hidden' }}>
        <Animated.View style={[{ position: 'absolute', width: size, height: size }, second]}>
          <View
            style={{
              position: 'absolute',
              left: half,
              width: half,
              height: size,
              overflow: 'hidden',
            }}
          >
            <View style={{ ...ring, marginLeft: -half }} />
          </View>
        </Animated.View>
      </View>

      <View
        style={{
          position: 'absolute',
          top: thickness,
          left: thickness,
          right: thickness,
          bottom: thickness,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {children}
      </View>
    </View>
  );
}
