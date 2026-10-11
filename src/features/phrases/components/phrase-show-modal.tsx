import { Modal, ScrollView, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, IconButton, Text } from '@/components';
import { languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { LanguageId } from '@/types';

export type ShownPhrase = { text: string; translation: string; language: LanguageId };

/**
 * A phrase filling the screen, to hold up to the person it is for.
 *
 * In a noisy station or a quiet pharmacy, reading out loud is not always the
 * right thing; turning the phone round is. The translation is set as large as
 * the screen allows, with the original small underneath for the owner.
 */
type ShowProps = {
  phrase: ShownPhrase | undefined;
  speaking: boolean;
  onListen: () => void;
  onClose: () => void;
};

export function PhraseShowModal(props: ShowProps) {
  return (
    /*
     * Its own safe-area provider, because a modal is its own window: the
     * app's provider measures the main window, which inside Expo Go reported
     * no navigation bar, so the Listen button sat under the back and home
     * buttons. Measured here, the padding fits this window on every phone.
     */
    <Modal
      visible={props.phrase !== undefined}
      animationType="fade"
      onRequestClose={props.onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <SafeAreaProvider>
        <ShowContent {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function ShowContent({ phrase, speaking, onListen, onClose }: ShowProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top + theme.spacing.sm,
        paddingBottom: insets.bottom + theme.spacing.lg,
        paddingHorizontal: theme.layout.screenPadding,
        gap: theme.spacing.base,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <IconButton name="close" variant="soft" accessibilityLabel={t('Close')} onPress={onClose} />
      </View>

      {phrase ? (
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', gap: theme.spacing.lg }}
        >
          <Text variant="overline" color="primaryStrong" align="center">
            {languageName(phrase.language)}
          </Text>
          <Text variant="display" align="center" selectable>
            {phrase.translation}
          </Text>
          <Text variant="bodyLarge" color="textSecondary" align="center" selectable>
            {phrase.text}
          </Text>
        </ScrollView>
      ) : null}

      <Button
        label={speaking ? t('Stop') : t('Listen')}
        icon={speaking ? 'stop-circle-outline' : 'volume-high-outline'}
        size="lg"
        fullWidth
        onPress={onListen}
        accessibilityHint={speaking ? t('Stops reading aloud') : t('Reads the phrase aloud')}
      />
    </View>
  );
}
