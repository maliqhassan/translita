import { Pressable } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

import { Icon } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

/**
 * The swap control, sitting between the From and To selectors.
 *
 * The selectors sit side by side, so the arrows point left and right — the
 * control says which way the pair flows by where it is drawn.
 */

export type SwapLanguagesButtonProps = {
  canSwap: boolean;
  onSwap: () => void;
};

export function SwapLanguagesButton({ canSwap, onSwap }: SwapLanguagesButtonProps) {
  const theme = useTheme();
  const rotation = useSharedValue(0);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  const handlePress = () => {
    // Half a turn per press, so repeated swaps keep spinning the same way.
    rotation.value = withSpring(rotation.value + 180, { damping: 14, stiffness: 160 });
    onSwap();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={!canSwap}
      hitSlop={theme.layout.iconHitSlop}
      accessibilityRole="button"
      accessibilityLabel={t('Swap languages')}
      accessibilityState={{ disabled: !canSwap }}
      style={({ pressed }) => ({
        width: theme.layout.minTouchTarget,
        height: theme.layout.minTouchTarget,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.full,
        backgroundColor: pressed ? theme.colors.primaryMuted : 'transparent',
        opacity: !canSwap
          ? theme.motion.opacityDisabled
          : pressed
            ? theme.motion.opacityPressed
            : 1,
      })}
    >
      <Animated.View style={iconStyle}>
        <Icon name="swap-horizontal" size={22} color="primary" />
      </Animated.View>
    </Pressable>
  );
}
