import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, SectionList, View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  IconButton,
  Screen,
  ScreenHeader,
  SearchField,
  Text,
} from '@/components';
import { errorMessage } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { LanguagePack } from '@/services';
import { useLanguagePair } from '@/store';

import { LanguagePackItem } from '../components/language-pack-item';
import { useLanguagePacks } from '../hooks/use-language-packs';
import { packSections, searchPackSections } from '../pack-sections';

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

  /**
   * "Recently used": the pair on screen right now, then whatever was chosen
   * lately on either side. The pair itself is also highlighted in the list,
   * so the languages that matter this minute are the easiest to find.
   */
  const { pair, recent } = useLanguagePair();
  const recentIds = [pair.target, pair.source, ...recent.target, ...recent.source];
  const inPair = new Set([pair.source, pair.target]);

  /** Filters the list as it is typed; an empty box shows the usual sections. */
  const [query, setQuery] = useState('');
  const searching = query.trim().length > 0;
  const listed = available ? packs : [];
  const sections = searching ? searchPackSections(listed, query) : packSections(listed, recentIds);

  /**
   * The green tick is also the remove control, so removing asks first — one
   * tap on a tick should never cost someone a download they meant to keep.
   */
  const confirmRemove = useCallback(
    (pack: LanguagePack) => {
      Alert.alert(
        t('Remove {language}?', { language: t(pack.name) }),
        t('It will need downloading again to translate this language offline.'),
        [
          { text: t('Cancel'), style: 'cancel' },
          { text: t('Remove'), style: 'destructive', onPress: () => remove(pack.modelId) },
        ],
      );
    },
    [remove],
  );

  return (
    <Screen edges={['top', 'bottom']} wash>
      <ScreenHeader
        title={t('Language Packs')}
        leading={
          <IconButton
            name="chevron-back-outline"
            accessibilityLabel={t('Back to settings')}
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
              {t('Offline translation is part of Translita Pro')}
            </Text>
            <Badge label={t('Pro')} tone="primary" />
          </View>

          <Text variant="caption" color="textSecondary">
            {downloaded > 0
              ? t(
                  'Packs already on this device are kept and can still be removed to free up space.',
                )
              : t('Pro downloads language packs so you can translate with no connection at all.')}
          </Text>

          <Button
            label={t('See what Pro includes')}
            variant="secondary"
            size="sm"
            icon="sparkles-outline"
            onPress={() => router.push('/upgrade')}
            accessibilityHint={t('Opens the Translita Pro screen')}
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
              accessibilityLabel={t('Dismiss this message')}
              onPress={dismissActionError}
            />
          </View>
        </Card>
      ) : null}

      {available && packs.length > 0 ? (
        <View style={{ paddingBottom: theme.spacing.md }}>
          <SearchField
            value={query}
            onChangeText={setQuery}
            onClear={() => setQuery('')}
            placeholder={t('Search {count} languages', { count: packs.length })}
            accessibilityLabel={t('Search languages')}
            returnKeyType="search"
          />
        </View>
      ) : null}

      <SectionList
        sections={sections}
        // A tap on a row's download control works first time, keyboard open
        // or not.
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        keyExtractor={(item) => item.modelId}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        // One white card holding both sections, like the approved design;
        // empty, the space goes to the explanation instead.
        style={
          sections.length === 0
            ? undefined
            : {
                flexGrow: 0,
                borderRadius: theme.radius.xl,
                backgroundColor: theme.colors.surface,
                ...theme.shadows.sm,
                shadowColor: theme.colors.shadow,
              }
        }
        contentContainerStyle={
          sections.length === 0
            ? { flexGrow: 1 }
            : { padding: theme.spacing.sm, paddingBottom: theme.spacing.base }
        }
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.xxs }} />}
        renderSectionHeader={({ section }) => (
          <Text
            variant="label"
            style={{
              paddingHorizontal: theme.spacing.md,
              paddingTop: section.key === 'recent' ? theme.spacing.sm : theme.spacing.lg,
              paddingBottom: theme.spacing.sm,
            }}
          >
            {section.title}
          </Text>
        )}
        ListEmptyComponent={
          searching ? (
            <Text
              variant="bodySmall"
              color="textSecondary"
              align="center"
              style={{ paddingVertical: theme.spacing.xl }}
            >
              No language matches “{query.trim()}”.
            </Text>
          ) : (
            <PacksEmptyState available={available} loading={loading} hasError={Boolean(error)} />
          )
        }
        renderItem={({ item }: { item: LanguagePack }) => (
          <LanguagePackItem
            pack={item}
            highlighted={inPair.has(item.language)}
            // Omitted rather than disabled when locked: the row then shows no
            // download control at all, so nothing offers an action that would
            // fetch a model the plan cannot use.
            onDownload={canDownload ? onPress(download) : undefined}
            onRemove={confirmRemove}
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
    return <EmptyState icon="cloud-download-outline" title={t('Checking for language packs')} />;
  }

  if (!available) {
    return (
      <EmptyState
        icon="phone-portrait-outline"
        title={t('On-device translation is not in this build')}
        description={t(
          'Language packs need the native translation module, which is only present in a development or release build of the app.',
        )}
      />
    );
  }

  if (hasError) {
    return (
      <EmptyState
        icon="alert-circle-outline"
        title={t('Could not read the language packs')}
        description={t('The on-device model list was unavailable. Try again in a moment.')}
      />
    );
  }

  return (
    <EmptyState
      icon="cloud-download-outline"
      title={t('No language packs available')}
      description={t('The on-device runtime reported no languages it can translate.')}
    />
  );
}
