import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

export type HomeActionsProps = {
  onOpenUpgrade: () => void;
  onOpenSettings: () => void;
};

/**
 * The header controls: Pro, and settings.
 *
 * The reference design also carries a help button. There is no help screen in
 * this app, and a control that opens nothing is worse than an absent one, so
 * it is left out rather than stubbed. It belongs here the day there is
 * something for it to open.
 *
 * Deliberately no crown: Ionicons, which is the only icon set in the project,
 * does not have one. `sparkles` is what the paywall already uses for the
 * ad-free benefit, so the two surfaces at least agree with each other.
 */
export function HomeActions({ onOpenUpgrade, onOpenSettings }: HomeActionsProps) {
  const theme = useTheme();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
      <Pressable
        onPress={onOpenUpgrade}
        accessibilityRole="button"
        accessibilityLabel={t('Translita Pro')}
        accessibilityHint={t('Opens the Pro screen')}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xs,
          height: theme.layout.minTouchTarget - theme.spacing.xs,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.full,
          // The brand's own pale blue with its ink — the one colour on the page.
          backgroundColor: theme.colors.primaryMuted,
          opacity: pressed ? theme.motion.opacityPressed : 1,
        })}
      >
        <Icon name="sparkles" size={15} color="primary" />
        <Text variant="label" color="primary">
          {t('Pro')}
        </Text>
      </Pressable>

      <Pressable
        onPress={onOpenSettings}
        accessibilityRole="button"
        accessibilityLabel={t('Open settings')}
        hitSlop={theme.layout.iconHitSlop}
        style={({ pressed }) => ({
          width: theme.layout.minTouchTarget,
          height: theme.layout.minTouchTarget,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.full,
          backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
        })}
      >
        <Icon name="settings-outline" size={22} color="textSecondary" />
      </Pressable>
    </View>
  );
}
