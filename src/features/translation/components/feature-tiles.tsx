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
  /**
   * Draws this tile as the headline one: full width, brand-filled.
   *
   * At most one tile should claim it. The point is to have somewhere for the
   * eye to land first, which stops working the moment everything is emphasised.
   */
  emphasis?: boolean;
};

/**
 * Shortcuts to the things the app can already do.
 *
 * Every tile goes somewhere real. The reference design also shows Phrases and
 * Quotation tiles; neither feature exists here, so neither is drawn — a tile
 * that opens nothing teaches a user not to trust the others.
 *
 * Deliberately given real visual weight rather than being a list of rows.
 * These are the second thing on the screen after translating, and the offline
 * one in particular is the app's whole distinguishing feature — it was
 * previously a 38pt icon on a hairline row, which read as a footnote.
 */
export function FeatureTiles({ tiles }: { tiles: readonly FeatureTile[] }) {
  const theme = useTheme();
  const { isLargeText, isNarrow } = useResponsive();

  if (tiles.length === 0) return null;

  /** Two columns, unless the text is large enough that two would truncate. */
  const single = isLargeText || isNarrow;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Text variant="label" color="textSecondary">
        Shortcuts
      </Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.spacing.sm }}>
        {tiles.map((tile) => {
          const wide = tile.emphasis || single;

          return (
            <Pressable
              key={tile.key}
              onPress={tile.onPress}
              accessibilityRole="button"
              accessibilityLabel={`${tile.title}. ${tile.subtitle}`}
              accessibilityHint={tile.accessibilityHint}
              style={({ pressed }) => ({
                width: wide ? '100%' : undefined,
                flexGrow: wide ? 0 : 1,
                flexBasis: wide ? '100%' : 0,
                minWidth: wide ? undefined : 150,
                flexDirection: tile.emphasis ? 'row' : 'column',
                alignItems: tile.emphasis ? 'center' : 'flex-start',
                gap: tile.emphasis ? theme.spacing.md : theme.spacing.sm,
                minHeight: theme.layout.minTouchTarget,
                padding: theme.spacing.base,
                borderRadius: theme.radius.lg,
                backgroundColor: tile.emphasis ? theme.colors.primary : theme.colors.surface,
                borderWidth: tile.emphasis ? 0 : theme.layout.borderWidth,
                borderColor: theme.colors.border,
                opacity: pressed ? theme.motion.opacityPressed : 1,
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: theme.radius.md,
                  // On the filled tile the badge has to lift off the brand
                  // rather than tint into it.
                  backgroundColor: tile.emphasis
                    ? theme.colors.onGradientSurface
                    : theme.colors.primaryMuted,
                }}
              >
                <Icon
                  name={tile.icon}
                  size={22}
                  color={tile.emphasis ? 'textOnPrimary' : 'primary'}
                />
              </View>

              <View style={{ flex: tile.emphasis ? 1 : undefined, gap: theme.spacing.xxs }}>
                <Text
                  variant="body"
                  style={{ fontWeight: '600' }}
                  color={tile.emphasis ? 'textOnPrimary' : 'text'}
                  numberOfLines={1}
                >
                  {tile.title}
                </Text>
                <Text
                  variant="caption"
                  color={tile.emphasis ? 'textOnPrimary' : 'textSecondary'}
                  numberOfLines={2}
                >
                  {tile.subtitle}
                </Text>
              </View>

              {tile.emphasis ? (
                <Icon name="chevron-forward" size={20} color="textOnPrimary" />
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
