import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, FlatList, Platform, View } from 'react-native';

import {
  EmptyState,
  IconButton,
  LoadingState,
  Screen,
  ScreenHeader,
  SearchField,
  SegmentedControl,
} from '@/components';
import { BrandMark } from '@/features/translation';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { HistoryEntry } from '@/types';

import { HistoryListItem } from '../components/history-list-item';
import { useFavoriteTranslations, useHistoryActions, useHistoryList } from '../hooks/use-history';

type Filter = 'all' | 'favorites';

/**
 * The full history list, backed by SQLite.
 *
 * Searching and ordering are done by the database, so this screen never holds
 * more than a page of rows and never sorts anything itself.
 *
 * Favourites have always been stored; they could only be found by scanning
 * the whole list for stars. The switch at the top shows them on their own,
 * from the repository's own favourites query.
 */
export function HistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const all = useHistoryList(search);
  const favorites = useFavoriteTranslations();
  const { toggleFavorite, remove, clear } = useHistoryActions();

  const history = filter === 'favorites' ? favorites : all;
  const isSearching = search.trim().length > 0;

  /*
   * The repository searches the whole table but not favourites alone, and a
   * page of favourites is small, so narrowing it here costs nothing.
   */
  const term = search.trim().toLowerCase();
  const entries =
    history.status !== 'success'
      ? []
      : filter === 'favorites' && term
        ? history.data.filter(
            (entry) =>
              entry.sourceText.toLowerCase().includes(term) ||
              entry.translatedText.toLowerCase().includes(term),
          )
        : history.data;

  const open = useCallback(
    (entry: HistoryEntry) => {
      router.push({ pathname: '/history/[id]', params: { id: entry.id } });
    },
    [router],
  );

  const confirmClear = useCallback(() => {
    Alert.alert(
      t('Clear history?'),
      t('This permanently deletes every saved translation on this device, including favourites.'),
      [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Clear all'), style: 'destructive', onPress: () => void clear() },
      ],
    );
  }, [clear]);

  const confirmDelete = useCallback(
    (entry: HistoryEntry) => {
      Alert.alert(t('Delete translation?'), t('This cannot be undone.'), [
        { text: t('Cancel'), style: 'cancel' },
        { text: t('Delete'), style: 'destructive', onPress: () => void remove(entry.id) },
      ]);
    },
    [remove],
  );

  function body() {
    if (history.status === 'loading') return <LoadingState message={t('Loading history…')} />;

    if (history.status === 'error') {
      return (
        <EmptyState
          icon="alert-circle-outline"
          title={t('History unavailable')}
          description={t(
            'Saved translations cannot be read on this device right now. Translating still works.',
          )}
        />
      );
    }

    if (entries.length === 0) {
      if (isSearching) {
        return (
          <EmptyState
            icon="search-outline"
            title={t('No matches')}
            description={
              filter === 'favorites'
                ? t('Nothing in your favourites matches “{query}”.', { query: search.trim() })
                : t('Nothing in your history matches “{query}”.', { query: search.trim() })
            }
          />
        );
      }

      return filter === 'favorites' ? (
        <EmptyState
          icon="star-outline"
          title={t('No favourites yet')}
          description={t('Tap the star on any saved translation to keep it here.')}
        />
      ) : (
        <EmptyState
          icon="time-outline"
          title={t('No translations yet')}
          description={t(
            'Translations you make are saved here so you can find them again offline.',
          )}
        />
      );
    }

    return (
      <FlatList
        data={entries}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: theme.spacing.md }} />}
        contentContainerStyle={{
          paddingHorizontal: theme.layout.screenPadding,
          paddingTop: theme.spacing.xs,
          paddingBottom: theme.spacing.xxxl,
        }}
        initialNumToRender={10}
        maxToRenderPerBatch={12}
        windowSize={9}
        removeClippedSubviews={Platform.OS === 'android'}
        renderItem={({ item }) => (
          <HistoryListItem
            entry={item}
            onPress={open}
            onToggleFavorite={(entry) => void toggleFavorite(entry.id)}
            onDelete={confirmDelete}
          />
        )}
      />
    );
  }

  return (
    <Screen
      edgeToEdge
      wash
      header={
        <View
          style={{
            paddingHorizontal: theme.layout.screenPadding,
            gap: theme.spacing.md,
            paddingBottom: theme.spacing.md,
          }}
        >
          <ScreenHeader
            compact
            title={t('History')}
            leading={<BrandMark />}
            actions={
              <IconButton
                name="trash-outline"
                variant="soft"
                accessibilityLabel={t('Clear all history')}
                disabled={all.status !== 'success' || all.data.length === 0}
                onPress={confirmClear}
              />
            }
          />
          <SearchField
            value={search}
            onChangeText={setSearch}
            onClear={() => setSearch('')}
            placeholder={t('Search your translations')}
            accessibilityLabel={t('Search saved translations')}
          />
          <SegmentedControl
            accessibilityLabel={t('Show all translations or only favourites')}
            options={[
              { value: 'all', label: t('All') },
              { value: 'favorites', label: t('Favourites') },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </View>
      }
    >
      <View style={{ flex: 1 }}>{body()}</View>
    </Screen>
  );
}
