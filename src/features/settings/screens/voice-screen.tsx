import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';

import {
  Card,
  Divider,
  EmptyState,
  IconButton,
  ListItem,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { errorMessage, languageName } from '@/constants';
import { useTheme } from '@/hooks';
import { voiceMatchesLanguage, type Voice } from '@/services';
import { useLanguagePair, usePreferences } from '@/store';

import { usePreviewVoice } from '../hooks/use-preview-voice';
import { useVoices } from '../hooks/use-voices';

/**
 * Choosing which voice reads translations aloud.
 *
 * Scoped to the current target language, because that is the only language
 * this screen can honestly offer voices for: the platform lists them per
 * language, and a voice from another one would read the translation in the
 * wrong accent or not at all.
 *
 * Selecting writes the voice *and* the language it was chosen for, which is
 * what lets the choice be applied only where it belongs and kept while the
 * user is translating into something else.
 */
export function VoiceScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { preferences, update } = usePreferences();
  const { pair } = useLanguagePair();

  const { loading, voices, error } = useVoices(pair.target);
  const preview = usePreviewVoice();

  /**
   * Choosing stops whatever is being auditioned.
   *
   * The screen is about to close; leaving a sample talking over the screen the
   * user just returned to would be the same bug unmount cleanup exists to
   * prevent, arriving by a different route.
   */
  const withPreviewStopped = (act: () => void) => () => {
    preview.stop();
    act();
  };

  /** The saved voice, but only when it belongs to the language shown here. */
  const selectedId =
    preferences.voiceId !== undefined &&
    preferences.voiceLanguage !== undefined &&
    voiceMatchesLanguage(preferences.voiceLanguage, pair.target)
      ? preferences.voiceId
      : undefined;

  const choose = (voice: Voice) => {
    update({ voiceId: voice.id, voiceLanguage: pair.target });
    router.back();
  };

  /**
   * Clearing writes both fields away together.
   *
   * Half a selection is unusable, and leaving a stale language behind would
   * make the next voice look as though it had been chosen for the wrong one.
   */
  const useDefault = () => {
    update({ voiceId: undefined, voiceLanguage: undefined });
    router.back();
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title="Voice"
        subtitle={`Used when reading ${languageName(pair.target)} aloud`}
        leading={
          <IconButton
            name="chevron-back-outline"
            accessibilityLabel="Back to settings"
            onPress={() => router.back()}
          />
        }
      />

      {/* A preview that failed says so without disturbing the list: the voice
          may have been uninstalled since it was enumerated, which is not a
          reason to hide everything else. */}
      {preview.error ? (
        <Card variant="outlined">
          <Text variant="bodySmall" color="warning">
            That voice could not be previewed. It may no longer be installed on this device.
          </Text>
        </Card>
      ) : null}

      <FlatList
        data={voices}
        keyExtractor={(voice) => voice.id}
        ItemSeparatorComponent={() => <Divider inset={theme.spacing.base} />}
        contentContainerStyle={voices.length === 0 ? { flexGrow: 1 } : undefined}
        ListHeaderComponent={
          <View>
            {/* Always offered, and always first: it is the state every install
                starts in, and the one thing guaranteed to work. */}
            <ListItem
              icon="phone-portrait-outline"
              title="Default"
              subtitle="Let this device choose"
              onPress={withPreviewStopped(useDefault)}
              showChevron={false}
              selected={selectedId === undefined}
              trailing={
                selectedId === undefined ? (
                  <Text variant="body" color="primary">
                    Selected
                  </Text>
                ) : undefined
              }
            />
            {voices.length > 0 ? <Divider inset={theme.spacing.base} /> : null}
          </View>
        }
        ListEmptyComponent={
          <VoicesEmptyState language={pair.target} loading={loading} error={error} />
        }
        renderItem={({ item }: { item: Voice }) => (
          <ListItem
            icon="mic-outline"
            // A voice may report no name; its identifier is still something.
            title={item.name || item.id}
            subtitle={item.language}
            onPress={withPreviewStopped(() => choose(item))}
            showChevron={false}
            selected={selectedId === item.id}
            accessibilityHint="Selects this voice for reading translations aloud"
            trailing={
              /* Two separate actions in one row, kept apart deliberately:
                 tapping the row selects, tapping the button only auditions.
                 A single tappable row would leave the user guessing which
                 one they were about to do. */
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
                {selectedId === item.id ? (
                  <Text variant="body" color="primary">
                    Selected
                  </Text>
                ) : null}

                <IconButton
                  name={preview.playingId === item.id ? 'stop-circle' : 'play-circle-outline'}
                  // The label carries the whole meaning, including that this
                  // only auditions: `IconButton` takes no hint, and a screen
                  // reader should not have to infer the difference between
                  // this control and the row it sits in.
                  accessibilityLabel={
                    preview.playingId === item.id
                      ? `Stop previewing ${item.name || item.id}`
                      : `Preview ${item.name || item.id} without selecting it`
                  }
                  onPress={() => preview.toggle(item)}
                />
              </View>
            }
          />
        )}
      />
    </Screen>
  );
}

/**
 * Why the list is empty, said accurately.
 *
 * "None installed" and "could not be read" are different problems: the first
 * is normal and needs no action, the second is a failure. Neither is an error
 * the user caused, and both still leave Default working.
 */
function VoicesEmptyState({
  language,
  loading,
  error,
}: {
  language: string;
  loading: boolean;
  error?: { code: string; message: string };
}) {
  if (loading) {
    return <EmptyState icon="mic-outline" title="Looking for voices" />;
  }

  if (error) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Could not read the available voices"
        description={errorMessage(error as Parameters<typeof errorMessage>[0])}
      />
    );
  }

  return (
    <EmptyState
      icon="mic-off-outline"
      title={`No ${languageName(language)} voices on this device`}
      description="Your device will use its own default voice instead. Installing a voice for this language in the system settings will make it available here."
    />
  );
}
