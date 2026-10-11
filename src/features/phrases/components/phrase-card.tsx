import { View } from 'react-native';

import { Card, IconButton, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

export type PhraseCardProps = {
  /** The phrase as written, in the language it was saved from. */
  text: string;
  /** Undefined while it is still being translated, or when that failed. */
  translation?: string;
  /** Shown in place of the translation while there is none. */
  pendingLabel?: string;
  /** A short tag such as the language, for saved phrases from several. */
  tag?: string;
  saved?: boolean;
  speaking?: boolean;
  onListen?: () => void;
  onShow?: () => void;
  onToggleSave?: () => void;
  onRemove?: () => void;
};

/**
 * One phrase: the translation large, the original under it, and what can be
 * done with it. The translation leads because it is the part being used — it
 * is what gets shown or read out to the person on the other side.
 */
export function PhraseCard({
  text,
  translation,
  pendingLabel,
  tag,
  saved = false,
  speaking = false,
  onListen,
  onShow,
  onToggleSave,
  onRemove,
}: PhraseCardProps) {
  const theme = useTheme();
  const ready = translation !== undefined;

  return (
    <Card variant="glass" padding="base" style={{ gap: theme.spacing.xs }}>
      {tag ? (
        <Text variant="overline" color="primaryStrong">
          {tag}
        </Text>
      ) : null}

      {ready ? (
        <Text variant="rowTitle" selectable>
          {translation}
        </Text>
      ) : (
        <Text variant="bodySmall" color="textMuted">
          {pendingLabel}
        </Text>
      )}
      <Text variant="bodySmall" color="textSecondary" selectable>
        {text}
      </Text>

      {ready ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.xs }}>
          {onListen ? (
            <IconButton
              name={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
              accessibilityLabel={
                speaking
                  ? t('Stop reading aloud')
                  : t('Read aloud: {text}', { text: translation ?? '' })
              }
              onPress={onListen}
            />
          ) : null}
          {onShow ? (
            <IconButton
              name="expand-outline"
              accessibilityLabel={t('Show this phrase in large text')}
              onPress={onShow}
            />
          ) : null}
          {onToggleSave ? (
            <IconButton
              name={saved ? 'bookmark' : 'bookmark-outline'}
              color={saved ? 'primary' : undefined}
              accessibilityLabel={saved ? t('Remove from saved phrases') : t('Save this phrase')}
              onPress={onToggleSave}
            />
          ) : null}
          {onRemove ? (
            <IconButton
              name="trash-outline"
              accessibilityLabel={t('Remove this saved phrase')}
              onPress={onRemove}
            />
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
