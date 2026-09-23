import { Pressable, View } from 'react-native';

import { Icon, IconButton, Text } from '@/components';
import { useTheme } from '@/hooks';

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
        accessibilityLabel="Transee Pro"
        accessibilityHint="Opens the Pro screen"
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: theme.spacing.xxs,
          height: 34,
          paddingHorizontal: theme.spacing.md,
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.warningMuted,
          opacity: pressed ? theme.motion.opacityPressed : 1,
        })}
      >
        <Icon name="sparkles" size={15} color="warning" />
        <Text variant="label" color="warning">
          Pro
        </Text>
      </Pressable>

      <IconButton
        name="settings-outline"
        variant="soft"
        accessibilityLabel="Open settings"
        onPress={onOpenSettings}
      />
    </View>
  );
}
