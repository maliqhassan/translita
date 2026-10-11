import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  iconPosition?: 'left' | 'right';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  accessibilityHint?: string;
};

const HEIGHTS: Record<ButtonSize, number> = { sm: 36, md: 46, lg: 54 };

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  fullWidth = false,
  style,
  accessibilityHint,
}: ButtonProps) {
  const theme = useTheme();
  const isInactive = disabled || loading;

  const surfaces: Record<ButtonVariant, ViewStyle> = {
    primary: { backgroundColor: theme.colors.primary },
    secondary: {
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border,
    },
    ghost: { backgroundColor: 'transparent' },
    danger: { backgroundColor: theme.colors.danger },
  };

  const labelColor = variant === 'primary' || variant === 'danger' ? 'textOnPrimary' : 'text';

  return (
    <Pressable
      onPress={onPress}
      disabled={isInactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: isInactive, busy: loading }}
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.base,
        surfaces[variant],
        {
          height: HEIGHTS[size],
          paddingHorizontal: size === 'sm' ? theme.spacing.md : theme.spacing.lg,
          borderRadius: theme.radius.md,
          opacity: isInactive
            ? theme.motion.opacityDisabled
            : pressed
              ? theme.motion.opacityPressed
              : 1,
          // A slight press-in, so a tap is felt as well as seen.
          transform: [{ scale: pressed && !isInactive ? theme.motion.scalePressed : 1 }],
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={
            variant === 'primary' || variant === 'danger'
              ? theme.colors.textOnPrimary
              : theme.colors.primary
          }
        />
      ) : (
        <View style={[styles.content, { gap: theme.spacing.sm }]}>
          {icon && iconPosition === 'left' ? (
            <Icon name={icon} size={size === 'lg' ? 20 : 18} color={labelColor} />
          ) : null}
          <Text
            variant={size === 'lg' ? 'buttonLarge' : 'button'}
            color={labelColor}
            numberOfLines={1}
            maxFontSizeMultiplier={1.3}
          >
            {label}
          </Text>
          {icon && iconPosition === 'right' ? (
            <Icon name={icon} size={size === 'lg' ? 20 : 18} color={labelColor} />
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center' },
  content: { flexDirection: 'row', alignItems: 'center' },
});
