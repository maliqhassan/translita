import { useRouter } from 'expo-router';

import { EmptyState, Screen } from '@/components';
import { t } from '@/i18n';

export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <Screen>
      <EmptyState
        icon="alert-circle-outline"
        title={t('Page not found')}
        description={t('That screen does not exist.')}
        actionLabel={t('Go to Translate')}
        onAction={() => router.replace('/')}
      />
    </Screen>
  );
}
