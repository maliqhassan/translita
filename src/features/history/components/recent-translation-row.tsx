import { Pressable, View } from 'react-native';

import { Icon, Text } from '@/components';
import { getLanguage } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { HistoryEntry, LanguageCode } from '@/types';
import { formatRelativeTime } from '@/utils';

export type RecentTranslationRowProps = {
  entry: HistoryEntry;
  onPress: (entry: HistoryEntry) => void;
};

function shortCode(code: LanguageCode): string {
  return code === 'auto' ? 'AUTO' : code.toUpperCase();
}

/**
 * A compact two-line summary: what was typed, and what came back. Denser than
 * the generic `ListItem`, which only carries a single title and subtitle.
 */
export function RecentTranslationRow({ entry, onPress }: RecentTranslationRowProps) {
  const theme = useTheme();
  const source = getLanguage(entry.sourceLanguage)?.name ?? entry.sourceLanguage;
  const target = getLanguage(entry.targetLanguage)?.name ?? entry.targetLanguage;

  return (
    <Pressable
      onPress={() => onPress(entry)}
      accessibilityRole="button"
      accessibilityLabel={`${t('{from} to {to}', { from: source, to: target })}. ${entry.sourceText}. ${t('Translated:')} ${entry.translatedText}`}
      accessibilityHint={t('Opens this translation')}
      style={({ pressed }) => ({
        gap: theme.spacing.xs,
        minHeight: theme.layout.minTouchTarget,
        paddingVertical: theme.spacing.md,
        paddingHorizontal: theme.spacing.base,
        backgroundColor: pressed ? theme.colors.surfaceMuted : 'transparent',
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <Text variant="caption" color="textMuted">
          {shortCode(entry.sourceLanguage)}
        </Text>
        <Icon name="arrow-forward" size={11} color="textMuted" />
        <Text variant="caption" color="primary">
          {shortCode(entry.targetLanguage)}
        </Text>
        <Text variant="caption" color="textMuted">
          {'·'}
        </Text>
        <Text variant="caption" color="textMuted">
          {formatRelativeTime(entry.createdAt)}
        </Text>
        {entry.isFavorite ? <Icon name="star" size={11} color="primary" /> : null}
      </View>

      <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
        {entry.sourceText}
      </Text>
      <Text variant="body" numberOfLines={2}>
        {entry.translatedText}
      </Text>
    </Pressable>
  );
}
