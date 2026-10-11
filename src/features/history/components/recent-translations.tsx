import { useRouter } from 'expo-router';
import { Fragment } from 'react';
import { View } from 'react-native';

import { Button, Card, Divider, EmptyState, LoadingState, SectionHeader, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { HistoryEntry } from '@/types';

import { useRecentTranslations } from '../hooks/use-history';

import { RecentTranslationRow } from './recent-translation-row';

/**
 * Recent translations, surfaced on the home screen. Owns its own data source
 * so the translate screen stays a composition of sections.
 */
export function RecentTranslations() {
  const theme = useTheme();
  const router = useRouter();
  const recent = useRecentTranslations();

  const entries = recent.status === 'success' ? recent.data : [];

  const open = (entry: HistoryEntry) => {
    router.push({ pathname: '/history/[id]', params: { id: entry.id } });
  };

  return (
    <View>
      <SectionHeader
        title={t('Recent')}
        action={
          entries.length > 0 ? (
            <Button
              label={t('See all')}
              variant="ghost"
              size="sm"
              icon="chevron-forward"
              iconPosition="right"
              onPress={() => router.push('/history')}
              style={{ paddingHorizontal: theme.spacing.xs }}
            />
          ) : undefined
        }
      />

      <Card variant="outlined" padding="none" style={{ borderRadius: theme.radius.xl }}>
        {recent.status === 'loading' ? (
          <View style={{ paddingVertical: theme.spacing.xl }}>
            <LoadingState message={t('Loading history…')} />
          </View>
        ) : recent.status === 'error' ? (
          // History is unavailable, but translating still works. Say only that.
          <EmptyState
            icon="alert-circle-outline"
            title={t('History unavailable')}
            description={t('Your translations cannot be saved on this device right now.')}
            compact
          />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="time-outline"
            title={t('Nothing yet')}
            description={t('Translations you make will show up here.')}
            compact
          />
        ) : (
          entries.map((entry, index) => (
            <Fragment key={entry.id}>
              {index > 0 ? <Divider inset={theme.spacing.base} /> : null}
              <RecentTranslationRow entry={entry} onPress={open} />
            </Fragment>
          ))
        )}
      </Card>

      {recent.status === 'success' && entries.length > 0 ? (
        <Text variant="caption" color="textMuted" style={{ marginTop: theme.spacing.sm }}>
          {t('Saved on this device only.')}
        </Text>
      ) : null}
    </View>
  );
}
