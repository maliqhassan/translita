import { Image, View } from 'react-native';

import { useTheme } from '@/hooks';

import { FABALITA } from '../fabalita';

import { Floating, PulseHalo } from './motion';

/**
 * Fabalita's face, in a glowing circle of the coach's blue.
 *
 * Animated, she floats and the circle pulses, so the coach reads as someone
 * there rather than one more icon. Still, she sits beside each line the AI
 * writes.
 */
export function CoachAvatar({ size = 48, animated = true }: { size?: number; animated?: boolean }) {
  const theme = useTheme();
  const orb = (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={FABALITA.name}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        borderWidth: Math.max(1, Math.round(size / 24)),
        borderColor: theme.colors.aiSurface,
        backgroundColor: theme.colors.aiFrom,
        experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
      }}
    >
      <Image
        source={FABALITA.image}
        resizeMode="contain"
        style={{ width: size * 0.86, height: size * 0.86, marginTop: size * 0.06 }}
      />
    </View>
  );
  if (!animated) return orb;
  return (
    <Floating>
      <PulseHalo size={size} color={theme.colors.aiGlow}>
        {orb}
      </PulseHalo>
    </Floating>
  );
}
