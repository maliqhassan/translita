import * as Clipboard from 'expo-clipboard';
import { Share, View } from 'react-native';

import { Card, IconButton, Text } from '@/components';
import { errorMessage } from '@/constants';
import { useTheme } from '@/hooks';

import type { ConversationTurn as Turn } from '../hooks/use-conversation';

export type ConversationTurnProps = {
  turn: Turn;
  /** Reads the translation aloud. Absent when the device cannot speak. */
  onSpeak?: (text: string, language: string) => void;
  speaking?: boolean;
};

/**
 * One turn in the transcript: what was heard, what it became, and the three
 * things you can do with it.
 *
 * Sided like a chat — the phone's owner on the right, the other speaker on
 * the left — because that is the one arrangement two people holding one phone
 * read without being told. Colour follows the side as well as position, so it
 * still reads when the phone is flat on a table between them.
 */
export function ConversationTurn({ turn, onSpeak, speaking }: ConversationTurnProps) {
  const theme = useTheme();
  const isNear = turn.side === 'near';

  /*
   * A turn is either a translation or a practice exchange, never both.
   *
   * `spoken` is whatever the bubble's main line should be, so the actions
   * underneath — share, copy, listen — work identically either way. A
   * clarification has no single answer to act on, so it offers none.
   */
  const tutor = turn.tutor;
  const translated =
    turn.result?.translatedText ?? (tutor?.kind === 'reply' ? tutor.reply : undefined);

  return (
    <View style={{ flexDirection: 'row', justifyContent: isNear ? 'flex-end' : 'flex-start' }}>
      <Card
        variant="outlined"
        padding="md"
        style={{
          maxWidth: '86%',
          gap: theme.spacing.xs,
          // The near speaker gets the brand tint; the far speaker a neutral
          // surface. Two tints of the same hue would be indistinguishable to
          // anyone reading it upside down across a table.
          backgroundColor: isNear ? theme.colors.primaryMuted : theme.colors.surfaceMuted,
        }}
      >
        <Text variant="bodySmall" color="textSecondary">
          {turn.heard}
        </Text>

        {/* Practice only: what the learner said, in their own language, so
            they can confirm they were understood as they meant to be. */}
        {tutor?.kind === 'reply' && tutor.heardGloss ? (
          <Text variant="caption" color="textMuted">
            {tutor.heardGloss}
          </Text>
        ) : null}

        <View style={{ height: 1, backgroundColor: theme.colors.border }} />

        {tutor?.kind === 'clarify' ? (
          // Offered instead of a guess. The tutor was not confident enough to
          // answer, and guessing at a learner's pronunciation teaches them
          // the wrong thing.
          <View style={{ gap: theme.spacing.xxs }}>
            <Text variant="bodySmall" color="textSecondary">
              Did you mean?
            </Text>
            {tutor.options.map((option) => (
              <Text key={option} variant="body" style={{ fontWeight: '600' }}>
                • {option}
              </Text>
            ))}
          </View>
        ) : tutor?.kind === 'declined' ? (
          <Text variant="bodySmall" color="textSecondary">
            {tutor.message}
          </Text>
        ) : translated ? (
          <View style={{ gap: theme.spacing.xxs }}>
            <Text variant="body" style={{ fontWeight: '600' }}>
              {translated}
            </Text>

            {/* The gloss and the question back only exist in practice. */}
            {tutor?.kind === 'reply' && tutor.gloss ? (
              <Text variant="caption" color="textMuted">
                {tutor.gloss}
              </Text>
            ) : null}
            {tutor?.kind === 'reply' && tutor.followUp ? (
              <Text variant="body" style={{ fontWeight: '600' }}>
                {tutor.followUp}
              </Text>
            ) : null}
            {tutor?.kind === 'reply' && tutor.followUpGloss ? (
              <Text variant="caption" color="textMuted">
                {tutor.followUpGloss}
              </Text>
            ) : null}
          </View>
        ) : turn.error ? (
          <Text variant="bodySmall" color="warning">
            {errorMessage(turn.error)}
          </Text>
        ) : (
          <Text variant="bodySmall" color="textMuted">
            Translating…
          </Text>
        )}

        {translated ? (
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: theme.spacing.xs }}>
            <IconButton
              name="share-outline"
              size={18}
              accessibilityLabel="Share this translation"
              onPress={() => void Share.share({ message: translated })}
            />
            <IconButton
              name="copy-outline"
              size={18}
              accessibilityLabel="Copy this translation"
              onPress={() => void Clipboard.setStringAsync(translated)}
            />
            {onSpeak ? (
              <IconButton
                name={speaking ? 'stop-circle-outline' : 'volume-medium-outline'}
                size={18}
                accessibilityLabel={speaking ? 'Stop reading aloud' : 'Read this aloud'}
                onPress={() => onSpeak(translated, turn.targetLanguage)}
              />
            ) : null}
          </View>
        ) : null}
      </Card>
    </View>
  );
}
