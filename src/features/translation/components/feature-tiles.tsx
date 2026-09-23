import { Pressable, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components';
import { useResponsive, useTheme } from '@/hooks';

export type FeatureTile = {
  key: string;
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityHint: string;
};

/**
 * Shortcuts to the things the app can already do.
 *
 * Every tile goes somewhere real. The reference design also shows Phrases and
 * Quotation tiles; neither feature exists here, so neither is drawn — a tile
 * that opens nothing teaches a user not to trust the others.
 *
 * Laid out two to a row, and one per row once the system font is large, where
 * two columns would leave every label truncated to a word and a half.
 */
export function FeatureTiles({ tiles }: { tiles: readonly FeatureTile[] }) {
  const theme = useTheme();
  const { isLargeText, isNarrow } = useResponsive();

  if (tiles.length === 0) return null;

  const single = isLargeText || isNarrow;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="label" color="textSecondary">
        Shortcuts
      </Text>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: theme.spacing.sm,
        }}
      >
        {tiles.map((tile) => (
          <Pressable
            key={tile.key}
            onPress={tile.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${tile.title}. ${tile.subtitle}`}
            accessibilityHint={tile.accessibilityHint}
            style={({ pressed }) => ({
              // Two columns are the gap short of half, so the row still fits
              // once the gap between them is counted.
              width: single ? '100%' : `${50}%`,
              flexGrow: 1,
              flexBasis: single ? '100%' : 0,
              minWidth: single ? undefined : 150,
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              minHeight: theme.layout.minTouchTarget,
              padding: theme.spacing.md,
              borderRadius: theme.radius.lg,
              backgroundColor: theme.colors.surface,
              borderWidth: theme.layout.borderWidth,
              borderColor: theme.colors.border,
              opacity: pressed ? theme.motion.opacityPressed : 1,
            })}
          >
            <View
              style={{
                width: 38,
                height: 38,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.primaryMuted,
              }}
            >
              <Icon name={tile.icon} size={19} color="primary" />
            </View>

            <View style={{ flex: 1 }}>
              <Text variant="body" numberOfLines={1}>
                {tile.title}
              </Text>
              <Text variant="caption" color="textSecondary" numberOfLines={1}>
                {tile.subtitle}
              </Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
