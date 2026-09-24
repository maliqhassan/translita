import { useRouter } from 'expo-router';
import { FlatList, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  ScreenHeader,
  Text,
} from '@/components';
import { errorMessage } from '@/constants';
import { useTheme } from '@/hooks';
import type { LanguagePack } from '@/services';

import { LanguagePackItem } from '../components/language-pack-item';
import { useLanguagePacks } from '../hooks/use-language-packs';

/**
 * Managing the on-device language models.
 *
 * Every language shown here is one the runtime reported it can serve, so a
 * language cannot appear merely because the catalogue contains it. Downloads
 * happen only when the user taps one: nothing is fetched on entering the
 * screen, and translating never triggers a download.
 */
export function LanguagePacksScreen() {
  const theme = useTheme();
  const router = useRouter();
  const {
    available,
    loading,
    packs,
    error,
    actionError,
    canDownload,
    download,
    remove,
    dismissActionError,
  } = useLanguagePacks();

  const downloaded = packs.filter((pack) => pack.state === 'ready').length;

  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader
        title="Language Packs"
        subtitle={
          canDownload
            ? 'Download a language to translate it without a connection'
            : 'Translating without a connection is part of Translita Pro'
        }
        leading={
          <IconButton
            name="chevron-back-outline"
            accessibilityLabel="Back to settings"
            onPress={() => router.back()}
          />
        }
      />

      {/* Said once, at the top, rather than repeated on every row. Downloading
          is what Pro unlocks; the packs already on the device stay listed and
          stay deletable, because reclaiming storage is not a paid feature. */}
      {available && !canDownload ? (
        <Card variant="outlined" style={{ gap: theme.spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Icon name="lock-closed-outline" size={18} color="primary" />
            <Text variant="bodySmall" style={{ flex: 1 }}>
              Offline translation is part of Translita Pro
            </Text>
            <Badge label="Pro" tone="primary" />
          </View>

          <Text variant="caption" color="textSecondary">
            {downloaded > 0
              ? 'Packs already on this device are kept and can still be removed to free up space.'
              : 'Pro downloads language packs so you can translate with no connection at all.'}
          </Text>

          <Button
            label="See what Pro includes"
            variant="secondary"
            size="sm"
            icon="sparkles-outline"
            onPress={() => router.push('/upgrade')}
            accessibilityHint="Opens the Translita Pro screen"
          />
        </Card>
      ) : null}

      {actionError ? (
        <Card variant="outlined">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <Text variant="bodySmall" color="danger" style={{ flex: 1 }}>
              {errorMessage(actionError)}
            </Text>
            <IconButton
              name="close-outline"
              accessibilityLabel="Dismiss this message"
              onPress={dismissActionError}
            />
          </View>
        </Card>
      ) : null}

      <FlatList
        data={available ? packs : []}
        keyExtractor={(item) => item.modelId}
        ItemSeparatorComponent={() => <Divider inset={theme.spacing.base} />}
        contentContainerStyle={packs.length === 0 ? { flexGrow: 1 } : undefined}
        ListHeaderComponent={
          available && packs.length > 0 ? (
            <View style={{ paddingBottom: theme.spacing.sm }}>
              <Text variant="bodySmall" color="textSecondary">
                A pack covers one language. Download both sides of a pair — English and German, say
                — to translate between them in either direction.
              </Text>
              <Text variant="caption" color="textMuted">
                {downloaded} of {packs.length} downloaded
              </Text>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <PacksEmptyState available={available} loading={loading} hasError={Boolean(error)} />
        }
        renderItem={({ item }: { item: LanguagePack }) => (
          <LanguagePackItem
            pack={item}
            // Omitted rather than disabled when locked: the row then shows no
            // download control at all, so nothing offers an action that would
            // fetch a model the plan cannot use.
            onDownload={canDownload ? onPress(download) : undefined}
            onRemove={onPress(remove)}
          />
        )}
      />
    </Screen>
  );
}

const onPress = (action: (modelId: string) => void) => (pack: LanguagePack) => action(pack.modelId);

/**
 * The three ways this list can be empty, said plainly.
 *
 * "No runtime in this build" is the common one and is not an error: a bundle
 * without the native module degrades to an engine that reports itself absent,
 * and saying so is more useful than an empty list.
 */
function PacksEmptyState({
  available,
  loading,
  hasError,
}: {
  available: boolean;
  loading: boolean;
  hasError: boolean;
}) {
  if (loading) {
    return <EmptyState icon="cloud-download-outline" title="Checking for language packs" />;
  }

  if (!available) {
    return (
      <EmptyState
        icon="phone-portrait-outline"
        title="On-device translation is not in this build"
        description="Language packs need the native translation module, which is only present in a development or release build of the app."
      />
    );
  }

  if (hasError) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title="Could not read the language packs"
        description="The on-device model list was unavailable. Try again in a moment."
      />
    );
  }

  return (
    <EmptyState
      icon="cloud-download-outline"
      title="No language packs available"
      description="The on-device runtime reported no languages it can translate."
    />
  );
}
