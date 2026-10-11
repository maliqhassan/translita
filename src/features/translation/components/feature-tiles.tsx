import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, Icon, Text, type IconName } from '@/components';
import { useResponsive, useTheme } from '@/hooks';
import { t } from '@/i18n';

export type FeatureTile = {
  key: string;
  icon: IconName;
  title: string;
  subtitle: string;
  onPress: () => void;
  accessibilityHint: string;
  /** A short tag beside the title, such as "New". */
  badge?: string;
};

/**
 * The other ways of translating, as an even two-by-two grid of cards.
 *
 * Every card is the same size, with its icon on top and its words underneath,
 * so each title and description gets the full width of its card. The grid
 * this replaced paired one tall card with two small ones whose words sat
 * beside the icon; those had room for about five letters, and "Camera" and
 * "AI Practice" came out as dots.
 *
 * Every card goes somewhere real — nothing is drawn for a feature the app does
 * not have. Shown below the Translate button both before and after a
 * translation, so the other ways in are never more than a scroll away.
 *
 * With large system text, even a half-width card cannot hold a word like
 * "Conversation", so every card becomes a full-width row instead of shrinking
 * the text.
 */
export function FeatureTiles({ tiles }: { tiles: readonly FeatureTile[] }) {
  const theme = useTheme();
  const { isLargeText } = useResponsive();

  if (tiles.length === 0) return null;

  // Pairs, so each row of the grid holds two cards of equal height.
  const rows: FeatureTile[][] = [];
  for (let index = 0; index < tiles.length; index += 2) {
    rows.push(tiles.slice(index, index + 2));
  }

  return (
    <View style={{ gap: theme.spacing.md }}>
      <Text variant="sectionLabel" color="textSecondary">
        {t('More ways to translate')}
      </Text>

      {isLargeText
        ? tiles.map((tile) => <RowTile key={tile.key} tile={tile} />)
        : rows.map((row) => (
            <View
              key={row.map((tile) => tile.key).join('-')}
              style={{ flexDirection: 'row', gap: theme.spacing.md }}
            >
              {/* An odd last card spans the full width as a row, rather than
                  sitting alone in half of it. */}
              {row.length === 1 && row[0] ? (
                <View style={{ flex: 1 }}>
                  <RowTile tile={row[0]} />
                </View>
              ) : (
                row.map((tile) => <GridCard key={tile.key} tile={tile} />)
              )}
            </View>
          ))}
    </View>
  );
}

/** The shared card: white, a hairline border, a soft shadow, a press-in. */
function TileCard({
  tile,
  children,
  flex,
  direction = 'row',
}: {
  tile: FeatureTile;
  children: ReactNode;
  flex?: number;
  direction?: 'row' | 'column';
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={tile.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${tile.badge ? `${t(tile.badge)}: ` : ''}${tile.title}. ${tile.subtitle}`}
      accessibilityHint={tile.accessibilityHint}
      style={({ pressed }) => ({
        flex,
        flexDirection: direction,
        alignItems: direction === 'column' ? 'flex-start' : 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.base,
        borderRadius: theme.radius.xl,
        borderWidth: theme.layout.borderWidth,
        borderColor: theme.colors.border,
        backgroundColor: pressed ? theme.colors.primaryMuted : theme.colors.surface,
        ...theme.shadows.sm,
        shadowColor: theme.colors.shadow,
        transform: [{ scale: pressed ? theme.motion.scalePressed : 1 }],
      })}
    >
      {children}
    </Pressable>
  );
}

/** A round pale-blue well holding the tile's blue icon. */
function IconWell({ name, size }: { name: IconName; size: number }) {
  const theme = useTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.primaryMuted,
      }}
    >
      <Icon name={name} size={Math.round(size * 0.5)} color="primary" />
    </View>
  );
}

/** Title over a quieter description of up to two lines. */
function Label({ tile }: { tile: FeatureTile }) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.xxs, alignSelf: 'stretch' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Text
          variant="rowTitle"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
          // A narrow phone can still be a few points short for "Conversation";
          // shrinking a little beats cutting the word off.
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          maxFontSizeMultiplier={1.2}
        >
          {tile.title}
        </Text>
        {tile.badge ? <Badge label={t(tile.badge)} tone="highlight" icon="sparkles" /> : null}
      </View>
      <Text variant="bodySmall" color="textSecondary" numberOfLines={2} maxFontSizeMultiplier={1.2}>
        {tile.subtitle}
      </Text>
    </View>
  );
}

function GridCard({ tile }: { tile: FeatureTile }) {
  return (
    <TileCard tile={tile} flex={1} direction="column">
      <IconWell name={tile.icon} size={44} />
      <Label tile={tile} />
    </TileCard>
  );
}

function RowTile({ tile }: { tile: FeatureTile }) {
  return (
    <TileCard tile={tile}>
      <IconWell name={tile.icon} size={44} />
      <View style={{ flex: 1 }}>
        <Label tile={tile} />
      </View>
      <Icon name="chevron-forward" size={20} color="textMuted" />
    </TileCard>
  );
}
