import { View } from 'react-native';

import { useTheme } from '@/hooks';

import { Icon, type IconName } from './icon';
import { Text, type TextColor } from './text';

/**
 * `highlight` is the one solid tone: the brand fill with dark ink, for the
 * rare tag that has to be noticed — a new feature — rather than read in passing.
 */
export type BadgeTone =
  'neutral' | 'primary' | 'highlight' | 'accent' | 'success' | 'warning' | 'danger';

export type BadgeProps = {
  label: string;
  tone?: BadgeTone;
  icon?: IconName;
};

/** Compact status pill — "Offline", "Downloaded", "Beta". */
export function Badge({ label, tone = 'neutral', icon }: BadgeProps) {
  const theme = useTheme();

  const tones: Record<BadgeTone, { background: string; foreground: TextColor }> = {
    neutral: { background: theme.colors.surfaceMuted, foreground: 'textSecondary' },
    primary: { background: theme.colors.primaryMuted, foreground: 'primary' },
    highlight: { background: theme.colors.primary, foreground: 'textOnPrimary' },
    accent: { background: theme.colors.accentMuted, foreground: 'accent' },
    success: { background: theme.colors.successMuted, foreground: 'success' },
    warning: { background: theme.colors.warningMuted, foreground: 'warning' },
    danger: { background: theme.colors.dangerMuted, foreground: 'danger' },
  };

  const { background, foreground } = tones[tone];

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: theme.spacing.xs,
        backgroundColor: background,
        borderRadius: theme.radius.full,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.xs,
      }}
    >
      {icon ? <Icon name={icon} size={12} color={foreground} /> : null}
      <Text variant="caption" color={foreground}>
        {label}
      </Text>
    </View>
  );
}
