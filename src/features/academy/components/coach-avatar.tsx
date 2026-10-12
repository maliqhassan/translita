import { View } from 'react-native';

import { Icon } from '@/components';
import { useTheme } from '@/hooks';

import { Floating, PulseHalo } from './motion';

/**
 * The AI coach's face: a glowing orb with a spark in it.
 *
 * Animated, it floats and pulses, so the coach reads as something alive
 * rather than one more icon. Still, it sits beside each line the AI writes.
 */
export function CoachAvatar({ size = 48, animated = true }: { size?: number; animated?: boolean }) {
  const theme = useTheme();
  const orb = (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: Math.max(1, Math.round(size / 24)),
        borderColor: theme.colors.aiSurface,
        backgroundColor: theme.colors.aiFrom,
        experimental_backgroundImage: `linear-gradient(135deg, ${theme.colors.aiFrom} 0%, ${theme.colors.aiTo} 100%)`,
      }}
    >
      <Icon name="sparkles" size={Math.round(size * 0.48)} color="onAi" />
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
