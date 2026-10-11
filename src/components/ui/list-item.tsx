import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { useTheme } from '@/hooks';

import { Icon, type IconName } from './icon';
import { Text } from './text';

export type ListItemProps = {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /**
   * Drawn in the same well as `icon`, for a glyph that is not an icon — a
   * flag, say. Takes precedence over `icon`.
   */
  leading?: ReactNode;
  /** Trailing slot — a Switch, Badge or plain text value. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** Shows a chevron. Defaults to true when `onPress` is provided. */
  showChevron?: boolean;
  destructive?: boolean;
  /** Overrides the label read out; defaults to title plus subtitle. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** Announced as selected, for pickers and option lists. */
  selected?: boolean;
};

/** Row primitive for settings, language pickers and history lists. */
export function ListItem({
  title,
  subtitle,
  icon,
  leading,
  trailing,
  onPress,
  showChevron,
  destructive = false,
  accessibilityLabel,
  accessibilityHint,
  selected,
}: ListItemProps) {
  const theme = useTheme();
  const chevron = showChevron ?? (Boolean(onPress) && !trailing);

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel ?? [title, subtitle].filter(Boolean).join(', ')}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !onPress, selected }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.layout.minTouchTarget + theme.spacing.md,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.base,
        backgroundColor: pressed && onPress ? theme.colors.surfaceMuted : 'transparent',
      })}
    >
      {leading || icon ? (
        <View
          style={{
            width: 40,
            height: 40,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: theme.radius.md,
            backgroundColor: destructive ? theme.colors.dangerMuted : theme.colors.surfaceMuted,
          }}
        >
          {leading ??
            (icon ? <Icon name={icon} size={20} color={destructive ? 'danger' : 'text'} /> : null)}
        </View>
      ) : null}

      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text
          variant="rowTitle"
          color={destructive ? 'danger' : 'text'}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
          {title}
        </Text>
        {subtitle ? (
          // The secondary ink, not the muted one: a row's subtitle usually
          // carries its current value ("English", "Automatic") and has to read.
          <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>

      {trailing}
      {chevron ? <Icon name="chevron-forward" size={18} color="textMuted" /> : null}
    </Pressable>
  );
}
