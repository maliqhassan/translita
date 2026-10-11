import { Pressable, View } from 'react-native';

import { Icon, IconButton, Text } from '@/components';
import { languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { HistoryEntry } from '@/types';
import { formatRelativeTime } from '@/utils';

export type HistoryListItemProps = {
  entry: HistoryEntry;
  onPress?: (entry: HistoryEntry) => void;
  onToggleFavorite?: (entry: HistoryEntry) => void;
  onDelete?: (entry: HistoryEntry) => void;
};

const ORIGIN_ICONS = {
  text: 'create-outline',
  camera: 'camera-outline',
  voice: 'mic-outline',
  clipboard: 'clipboard-outline',
} as const;

/**
 * One saved translation, as a card: the pair and when, what was written, and
 * what it became.
 *
 * It used to be a single truncated line of the translation alone, which made
 * the list hard to scan — the original is usually what someone remembers and
 * searches their eye for. Both are shown now, two lines each.
 *
 * Pure presentation — persistence lives in the repository.
 */
export function HistoryListItem({
  entry,
  onPress,
  onToggleFavorite,
  onDelete,
}: HistoryListItemProps) {
  const theme = useTheme();
  const source = languageName(entry.sourceLanguage);
  const target = languageName(entry.targetLanguage);

  return (
    <Pressable
      onPress={onPress ? () => onPress(entry) : undefined}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t('{from} to {to}', { from: source, to: target })}. ${entry.sourceText}. ${t('Translated:')} ${entry.translatedText}. ${entry.isFavorite ? t('Favourite.') : ''}`}
      style={({ pressed }) => ({
        gap: theme.spacing.sm,
        padding: theme.spacing.base,
        borderRadius: theme.radius.xl,
        backgroundColor: theme.colors.surface,
        borderWidth: theme.layout.borderWidth,
        borderColor: theme.colors.glassBorder,
        ...theme.shadows.sm,
        shadowColor: theme.colors.shadow,
        opacity: pressed ? theme.motion.opacityPressed : 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <View
          style={{
            flexShrink: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            paddingHorizontal: theme.spacing.sm,
            paddingVertical: theme.spacing.xxs,
            borderRadius: theme.radius.full,
            backgroundColor: theme.colors.primaryMuted,
          }}
        >
          <Icon name={ORIGIN_ICONS[entry.origin]} size={13} color="primary" />
          <Text variant="caption" color="primary" numberOfLines={1}>
            {source} → {target}
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <Text variant="caption" color="textMuted" numberOfLines={1}>
          {formatRelativeTime(entry.createdAt)}
        </Text>
      </View>

      <View style={{ gap: theme.spacing.xxs }}>
        <Text variant="bodySmall" color="textSecondary" numberOfLines={2}>
          {entry.sourceText}
        </Text>
        <Text variant="rowTitle" numberOfLines={2}>
          {entry.translatedText}
        </Text>
      </View>

      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'flex-end',
          gap: theme.spacing.xxs,
          marginTop: -theme.spacing.xs,
          marginRight: -theme.spacing.xs,
        }}
      >
        <IconButton
          name={entry.isFavorite ? 'star' : 'star-outline'}
          size={20}
          accessibilityLabel={
            entry.isFavorite
              ? t('Remove {language} translation from favourites', { language: target })
              : t('Add {language} translation to favourites', { language: target })
          }
          onPress={onToggleFavorite ? () => onToggleFavorite(entry) : undefined}
        />
        {onDelete ? (
          <IconButton
            name="trash-outline"
            size={20}
            accessibilityLabel={t('Delete {language} translation', { language: target })}
            onPress={() => onDelete(entry)}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
