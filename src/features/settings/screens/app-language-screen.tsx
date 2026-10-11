import { useRouter } from 'expo-router';

import { IconButton, Screen, ScreenHeader } from '@/components';
import { isAppLanguage, t, type AppLanguageCode } from '@/i18n';
import { usePreferences } from '@/store';

import { AppLanguageList } from '../components/app-language-list';

/**
 * Choosing the language the app's own words are in.
 *
 * Separate from the languages being translated: this changes the menus,
 * buttons and messages, not what the user translates. Choosing closes the
 * screen, and the app redraws in the new language.
 */
export function AppLanguageScreen() {
  const router = useRouter();
  const { preferences, update } = usePreferences();
  const selected = isAppLanguage(preferences.appLanguage) ? preferences.appLanguage : 'en';

  const choose = (code: AppLanguageCode) => {
    router.back();
    if (code !== selected) update({ appLanguage: code });
  };

  return (
    <Screen
      scrollable
      edges={['top', 'bottom']}
      header={
        <ScreenHeader
          title={t('App language')}
          subtitle={t('The language of menus, buttons and messages')}
          leading={
            <IconButton
              name="chevron-back-outline"
              accessibilityLabel={t('Back to settings')}
              onPress={() => router.back()}
            />
          }
        />
      }
    >
      <AppLanguageList selected={selected} onSelect={choose} />
    </Screen>
  );
}
