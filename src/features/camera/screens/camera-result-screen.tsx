import { EmptyState, Screen, ScreenHeader } from '@/components';
import { t } from '@/i18n';

/**
 * Review surface for a captured frame: recognised blocks on the left, their
 * translations on the right. Populated on the camera day.
 */
export function CameraResultScreen() {
  return (
    <Screen edges={['top', 'bottom']}>
      <ScreenHeader title={t('Scan result')} />
      <EmptyState
        icon="scan-outline"
        title={t('Nothing scanned yet')}
        description={t('Recognised text and its translation will be shown here after a capture.')}
      />
    </Screen>
  );
}
