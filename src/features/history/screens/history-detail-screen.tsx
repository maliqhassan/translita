import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { Alert, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { languageName, languageShortCode } from '@/constants';
import { useCopyToClipboard, useSpeak } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { HistoryEntry } from '@/types';
import { formatRelativeTime } from '@/utils';

import { useHistoryActions, useHistoryEntry } from '../hooks/use-history';

/** One side of the translation: language label above its text. */
function TextPanel({
  label,
  code,
  text,
  emphasis,
}: {
  label: string;
  code: string;
  text: string;
  emphasis?: boolean;
}) {
  const theme = useTheme();
  return (
    <Card variant={emphasis ? 'filled' : 'outlined'} style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
        <Text variant="caption" color={emphasis ? 'primary' : 'textMuted'}>
          {label.toUpperCase()}
        </Text>
        <Text variant="caption" color="textMuted">
          {code}
        </Text>
      </View>
      <Text variant={emphasis ? 'translatedText' : 'sourceText'} selectable>
        {text}
      </Text>
    </Card>
  );
}

/** A saved translation, loaded from the history repository by route id. */
export function HistoryDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const entry = useHistoryEntry(id);
  const { toggleFavorite, remove } = useHistoryActions();
  const copy = useCopyToClipboard();
  const speak = useSpeak();

  const confirmDelete = useCallback(
    (record: HistoryEntry) => {
      Alert.alert(t('Delete translation?'), t('This cannot be undone.'), [
        { text: t('Cancel'), style: 'cancel' },
        {
          text: t('Delete'),
          style: 'destructive',
          onPress: () => {
            void remove(record.id).then(() => router.back());
          },
        },
      ]);
    },
    [remove, router],
  );

  const header = (
    <ScreenHeader
      compact
      title={t('Translation')}
      actions={
        <IconButton
          name="close"
          variant="soft"
          accessibilityLabel={t('Close')}
          onPress={router.back}
        />
      }
    />
  );

  if (entry.status === 'loading') {
    return (
      <Screen edges={['top', 'bottom']} header={header}>
        <LoadingState message={t('Loading translation…')} />
      </Screen>
    );
  }

  if (entry.status === 'error') {
    return (
      <Screen edges={['top', 'bottom']} header={header}>
        <EmptyState
          icon="alert-circle-outline"
          title={t('History unavailable')}
          description={t('Saved translations cannot be read on this device right now.')}
        />
      </Screen>
    );
  }

  // A deleted entry is a normal outcome, not a crash: the row may have gone
  // while this screen was open, or the link may be stale.
  if (!entry.data) {
    return (
      <Screen edges={['top', 'bottom']} header={header}>
        <EmptyState
          icon="document-text-outline"
          title={t('Translation not found')}
          description={t('This translation is no longer saved on your device.')}
          actionLabel={t('Back to history')}
          onAction={() => router.back()}
        />
      </Screen>
    );
  }

  const record = entry.data;
  const sourceId = record.detectedLanguage ?? record.sourceLanguage;

  return (
    <Screen edges={['top', 'bottom']} scrollable header={header}>
      <TextPanel label={t('From')} code={languageShortCode(sourceId)} text={record.sourceText} />

      <View style={{ alignItems: 'center' }}>
        <Text variant="caption" color="textMuted">
          ↓
        </Text>
      </View>

      <TextPanel
        label={t('To')}
        code={languageShortCode(record.targetLanguage)}
        text={record.translatedText}
        emphasis
      />

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: theme.spacing.sm,
        }}
      >
        <Text variant="bodySmall" color="textSecondary">
          {languageName(sourceId)} → {languageName(record.targetLanguage)}
        </Text>
        <Badge label={formatRelativeTime(record.createdAt)} tone="neutral" icon="time-outline" />
      </View>

      {/* Read in the translation's own language, with the voice and speed
          chosen in Settings — the same control as on the Translate screen.
          Hidden on a device with no speech engine rather than failing. */}
      {speak.available ? (
        <Button
          label={speak.isSpeaking(record.translatedText) ? t('Stop') : t('Listen')}
          icon={
            speak.isSpeaking(record.translatedText) ? 'stop-circle-outline' : 'volume-high-outline'
          }
          fullWidth
          onPress={() => speak.toggle(record.translatedText, record.targetLanguage)}
          accessibilityHint={
            speak.isSpeaking(record.translatedText)
              ? t('Stops reading aloud')
              : t('Reads the translation aloud')
          }
        />
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <Button
          label={copy.justCopied ? t('Copied') : t('Copy')}
          icon={copy.justCopied ? 'checkmark-circle' : 'copy-outline'}
          variant="secondary"
          onPress={() => copy.copy(record.translatedText)}
          accessibilityHint={t('Copies the translation to the clipboard')}
          style={{ flex: 1 }}
        />
        <Button
          label={record.isFavorite ? t('Favourited') : t('Favourite')}
          icon={record.isFavorite ? 'star' : 'star-outline'}
          variant="secondary"
          onPress={() => void toggleFavorite(record.id)}
          accessibilityHint={
            record.isFavorite ? t('Removes this from favourites') : t('Adds this to favourites')
          }
          style={{ flex: 1 }}
        />
      </View>

      <Button
        label={t('Delete')}
        icon="trash-outline"
        variant="danger"
        fullWidth
        onPress={() => confirmDelete(record)}
        accessibilityHint={t('Permanently deletes this saved translation')}
      />
    </Screen>
  );
}
