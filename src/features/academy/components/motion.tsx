import { useEffect, useRef, useState, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Text, type TextProps } from '@/components';
import { useTheme } from '@/hooks';

/**
 * The Academy's small motions, each one a wrapper.
 *
 * Reanimated drives them on the UI thread, and its animations follow the
 * phone's reduce-motion setting by default: with it on they jump to their
 * end, and the loops stand still.
 */

/** Rings that swell out from behind their child and fade, again and again. */
export function PulseHalo({
  size,
  color,
  active = true,
  children,
}: {
  size: number;
  color: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {active ? (
        <>
          <Wave size={size} color={color} offset={0} />
          <Wave size={size} color={color} offset={0.5} />
        </>
      ) : null}
      {children}
    </View>
  );
}

function Wave({ size, color, offset }: { size: number; color: string; offset: number }) {
  const theme = useTheme();
  const wave = useSharedValue(0);
  const period = theme.motion.loop.pulse;

  useEffect(() => {
    wave.set(
      withDelay(
        offset * period,
        withRepeat(withTiming(1, { duration: period, easing: Easing.out(Easing.quad) }), -1),
      ),
    );
    return () => cancelAnimation(wave);
  }, [wave, offset, period]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.9 * (1 - wave.get()),
    transform: [{ scale: 1 + wave.get() * 0.55 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        style,
      ]}
    />
  );
}

/** Drifts gently up and down, for things that should feel alive. */
export function Floating({
  distance = 4,
  children,
  style,
}: {
  distance?: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const lift = useSharedValue(0);
  const half = theme.motion.loop.float / 2;

  useEffect(() => {
    lift.set(
      withRepeat(withTiming(1, { duration: half, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(lift);
  }, [lift, half]);

  const animated = useAnimatedStyle(() => ({
    transform: [{ translateY: -distance * lift.get() }],
  }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A quick shake from side to side, each time `active` turns on: a wrong answer. */
export function Shake({ active, children }: { active: boolean; children: ReactNode }) {
  const theme = useTheme();
  const x = useSharedValue(0);
  const reach = theme.spacing.sm;
  const step = theme.motion.duration.instant / 2;

  useEffect(() => {
    if (!active) return;
    x.set(
      withSequence(
        withTiming(-reach, { duration: step }),
        withTiming(reach, { duration: step }),
        withTiming(-reach * 0.6, { duration: step }),
        withTiming(reach * 0.6, { duration: step }),
        withTiming(0, { duration: step }),
      ),
    );
  }, [active, x, reach, step]);

  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** A small bounce, each time `active` turns on: a right answer. */
export function Pop({ active, children }: { active: boolean; children: ReactNode }) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const spring = theme.motion.spring;

  useEffect(() => {
    if (!active) return;
    scale.set(withSequence(withSpring(1.06, spring), withSpring(1, spring)));
  }, [active, scale, spring]);

  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Breathes in and out slowly, for the one thing to press next. */
export function Breathing({
  active = true,
  children,
  style,
}: {
  active?: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const scale = useSharedValue(1);
  const half = theme.motion.loop.pulse / 2;

  useEffect(() => {
    if (!active) {
      cancelAnimation(scale);
      scale.set(withTiming(1));
      return;
    }
    scale.set(
      withRepeat(withTiming(1.03, { duration: half, easing: Easing.inOut(Easing.sin) }), -1, true),
    );
    return () => cancelAnimation(scale);
  }, [active, scale, half]);

  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return <Animated.View style={[style, animated]}>{children}</Animated.View>;
}

/** A number that counts up to its value, rather than appearing all at once. */
export function CountUp({
  value,
  suffix = '',
  ...text
}: Omit<TextProps, 'children'> & { value: number; suffix?: string }) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(0);
  const from = useRef(0);
  const duration = theme.motion.duration.long;

  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    let frame = 0;
    const began = Date.now();
    const tick = () => {
      const done = reduced ? 1 : Math.min((Date.now() - began) / duration, 1);
      const next = Math.round(start + (value - start) * (1 - (1 - done) ** 3));
      from.current = next;
      setShown(next);
      if (done < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return (
    <Text {...text} accessibilityLabel={`${value}${suffix}`}>
      {`${shown}${suffix}`}
    </Text>
  );
}

/** Three dots bouncing in turn: the AI is writing. */
export function TypingDots({ color }: { color: string }) {
  const theme = useTheme();
  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}
      accessibilityRole="progressbar"
    >
      {[0, 1, 2].map((index) => (
        <Dot key={index} color={color} delay={index * theme.motion.stagger * 2} />
      ))}
    </View>
  );
}

function Dot({ color, delay }: { color: string; delay: number }) {
  const theme = useTheme();
  const lift = useSharedValue(0);
  const step = theme.motion.duration.slow;

  useEffect(() => {
    lift.set(
      withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(1, { duration: step, easing: Easing.out(Easing.quad) }),
            withTiming(0, { duration: step, easing: Easing.in(Easing.quad) }),
          ),
          -1,
        ),
      ),
    );
    return () => cancelAnimation(lift);
  }, [lift, delay, step]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.4 + lift.get() * 0.6,
    transform: [{ translateY: -lift.get() * 4 }],
  }));
  return (
    <Animated.View
      style={[{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }, style]}
    />
  );
}
