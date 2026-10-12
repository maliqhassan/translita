import { useEffect, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '@/hooks';

import { seededRandom } from '../lesson/plan';

const PIECES = 36;

type Piece = {
  x: number;
  size: number;
  round: boolean;
  color: string;
  delay: number;
  duration: number;
  drift: number;
  spin: number;
};

/**
 * A burst of confetti falling over the screen, once, for a finished day.
 *
 * Every piece is placed from a fixed seed, so the burst is the same each time
 * and nothing random is read while rendering. It never takes a touch.
 */
export function Confetti() {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const [pieces] = useState<readonly Piece[]>(() => {
    const random = seededRandom('confetti');
    const colors = [
      theme.colors.primary,
      theme.colors.aiFrom,
      theme.colors.flame,
      theme.colors.success,
      theme.colors.accent,
      theme.colors.danger,
    ];
    return Array.from({ length: PIECES }, (_, index) => ({
      x: random(),
      size: 6 + Math.round(random() * 6),
      round: random() < 0.35,
      color: colors[index % colors.length]!,
      delay: Math.round(random() * 400),
      duration: 1800 + Math.round(random() * 1200),
      drift: (random() - 0.5) * 120,
      spin: 360 + Math.round(random() * 540),
    }));
  });

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((piece, index) => (
        <Falling key={index} piece={piece} width={width} height={height} />
      ))}
    </View>
  );
}

function Falling({ piece, width, height }: { piece: Piece; width: number; height: number }) {
  const fall = useSharedValue(0);

  useEffect(() => {
    fall.set(
      withDelay(
        piece.delay,
        withTiming(1, { duration: piece.duration, easing: Easing.out(Easing.quad) }),
      ),
    );
  }, [fall, piece]);

  const style = useAnimatedStyle(() => {
    const at = fall.get();
    return {
      opacity: at === 0 ? 0 : at < 0.75 ? 1 : (1 - at) / 0.25,
      transform: [
        { translateY: -40 + at * height * 0.9 },
        { translateX: Math.sin(at * Math.PI * 2) * piece.drift * 0.5 + piece.drift * at },
        { rotate: `${at * piece.spin}deg` },
      ],
    };
  });

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          top: 0,
          left: piece.x * width,
          width: piece.size,
          height: piece.round ? piece.size : piece.size * 1.6,
          borderRadius: piece.round ? piece.size / 2 : 2,
          backgroundColor: piece.color,
        },
        style,
      ]}
    />
  );
}
