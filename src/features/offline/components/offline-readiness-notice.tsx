import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Button, Card, Icon, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';
import type { OfflineReadiness } from '@/services';

import { offlineNotice } from '../offline-notice';

export type OfflineReadinessNoticeProps = {
  /** Undefined while the first check is still running: render nothing. */
  readiness?: OfflineReadiness;
};

/**
 * Says why on-device translation cannot run, before the user tries it.
 *
 * Deliberately not an error: nothing has failed yet. It appears only in
 * on-device mode and only when there is something to say, so a ready pair
 * shows no chrome at all.
 */
export function OfflineReadinessNotice({ readiness }: OfflineReadinessNoticeProps) {
  const theme = useTheme();
  const router = useRouter();

  if (!readiness) return null;

  const notice = offlineNotice(readiness);
  if (!notice) return null;

  return (
    <Card variant="outlined" style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        <Icon name="cloud-offline-outline" size={18} color="textSecondary" />
        <Text variant="bodySmall" style={{ flex: 1 }}>
          {notice.title}
        </Text>
      </View>

      <Text variant="caption" color="textSecondary">
        {notice.description}
      </Text>

      {notice.actionLabel ? (
        <Button
          label={notice.actionLabel}
          variant="secondary"
          size="sm"
          icon="cloud-download-outline"
          onPress={() => router.push('/settings/language-packs')}
          accessibilityHint={t(
            'Opens the language packs screen so you can download what this pair needs',
          )}
        />
      ) : null}
    </Card>
  );
}
