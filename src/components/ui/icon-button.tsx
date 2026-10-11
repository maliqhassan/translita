import { Pressable, StyleSheet, type ViewStyle } from 'react-native';

import type { ColorTokens } from '@/constants';
import { useTheme } from '@/hooks';

import { Icon, type IconName } from './icon';

export type IconButtonProps = {
  name: IconName;
  onPress?: () => void;
  /** Required — icon-only controls are invisible to screen readers otherwise. */
  accessibilityLabel: string;
  variant?: 'plain' | 'soft' | 'solid';
  size?: number;
  /** Glyph colour; defaults to the ink that suits the variant. */
  color?: keyof ColorTokens;
  disabled?: boolean;
  style?: ViewStyle;
};

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  variant = 'plain',
  size = 20,
  color,
  disabled = false,
  style,
}: IconButtonProps) {
  const theme = useTheme();

  const backgrounds: Record<NonNullable<IconButtonProps['variant']>, string> = {
    plain: 'transparent',
    soft: theme.colors.surfaceMuted,
    solid: theme.colors.primary,
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={theme.layout.iconHitSlop}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.base,
        {
          width: theme.layout.minTouchTarget,
          height: theme.layout.minTouchTarget,
          borderRadius: theme.radius.full,
          backgroundColor: backgrounds[variant],
          opacity: disabled
            ? theme.motion.opacityDisabled
            : pressed
              ? theme.motion.opacityPressed
              : 1,
        },
        style,
      ]}
    >
      <Icon
        name={name}
        size={size}
        color={color ?? (variant === 'solid' ? 'textOnPrimary' : 'text')}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
});
