import { useEffect } from 'react';
import { BackHandler, ScrollView, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, IconButton, Text } from '@/components';
import { AppLanguageList } from '@/features/settings';
import { BrandMark } from '@/features/translation';
import { useTheme } from '@/hooks';
import { isAppLanguage, t, useAppLanguage, type AppLanguageCode } from '@/i18n';
import { usePreferences } from '@/store';

/**
 * Which language the app should speak, right after the loading page.
 *
 * Asked before anything else so the welcome screen, the tour and every screen
 * after them are in the user's own language. The phone's language is chosen
 * already when the app speaks it, so most people only press Continue. Tapping
 * another language switches this screen to it at once, which is the clearest
 * way to show what the choice does.
 *
 * Shown once to existing users too, with a close button (and Android's back)
 * for anyone happy as they are. What confirming or closing means is up to
 * the caller; this screen only changes the language as it is tapped.
 */
export function LanguageSelectScreen({
  onContinue,
  onClose,
}: {
  onContinue: (code: AppLanguageCode) => void;
  /** Offers a way out without choosing. Onboarding has none. */
  onClose?: () => void;
}) {
  const theme = useTheme();
  const { update } = usePreferences();

  useEffect(() => {
    if (!onClose) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => subscription.remove();
  }, [onClose]);
  // Redraws this screen in each language as it is tapped.
  const language = useAppLanguage();

  const choose = (code: AppLanguageCode) => update({ appLanguage: code });
  const selected = isAppLanguage(language) ? language : 'en';

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View
          style={{
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.lg,
            gap: theme.spacing.sm,
            alignItems: 'center',
          }}
        >
          {onClose ? (
            <View style={{ alignSelf: 'stretch', alignItems: 'flex-end' }}>
              <IconButton
                name="close"
                variant="soft"
                accessibilityLabel={t('Close and keep the current language')}
                onPress={onClose}
              />
            </View>
          ) : null}
          <BrandMark />
          <Text variant="h1" align="center">
            {t('Choose your language')}
          </Text>
          <Text variant="bodyLarge" color="textSecondary" align="center">
            {onClose
              ? t(
                  'Translita is now available in your language. You can change it later in Settings.',
                )
              : t('You can change this later in Settings.')}
          </Text>
        </View>

        <ScrollView
          style={{ flex: 1, marginTop: theme.spacing.lg }}
          contentContainerStyle={{
            paddingHorizontal: theme.layout.screenPadding,
            paddingBottom: theme.spacing.base,
          }}
        >
          <AppLanguageList selected={selected} onSelect={choose} />
        </ScrollView>

        <View
          style={{
            paddingHorizontal: theme.layout.screenPadding,
            paddingTop: theme.spacing.sm,
            paddingBottom: theme.spacing.lg,
          }}
        >
          <Button
            label={t('Continue')}
            icon="arrow-forward"
            iconPosition="right"
            size="lg"
            fullWidth
            onPress={() => onContinue(selected)}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}
