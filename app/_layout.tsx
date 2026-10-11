import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type Theme as NavigationTheme,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Theme } from '@/constants';
import { AppOpenAdController } from '@/features/ads';
import { LanguagePrompt, OnboardingFlow } from '@/features/onboarding';
import { ReturnToSettingsOnLanguageChange } from '@/features/settings';
import { ServerWarmup } from '@/features/translation';
import { useTheme } from '@/hooks';
import { DEFAULT_APP_LANGUAGE, I18nProvider, isAppLanguage } from '@/i18n';
import { AppProviders, usePreferences } from '@/store';

void SplashScreen.preventAutoHideAsync();

/** Maps the design system onto React Navigation so native chrome matches. */
function toNavigationTheme(theme: Theme): NavigationTheme {
  const base = theme.scheme === 'dark' ? DarkTheme : DefaultTheme;
  return {
    ...base,
    dark: theme.scheme === 'dark',
    colors: {
      ...base.colors,
      primary: theme.colors.primary,
      background: theme.colors.background,
      card: theme.colors.surface,
      text: theme.colors.text,
      border: theme.colors.border,
      notification: theme.colors.danger,
    },
  };
}

/**
 * Lives inside AppProviders so it can read the resolved theme. Route options
 * that apply app-wide belong here rather than in individual screens.
 */
function RootNavigator() {
  const theme = useTheme();
  const { preferences, update } = usePreferences();

  /**
   * Whether onboarding was already done when the app opened. Read once, on
   * the first render: finishing the tour flips the preference, but it must
   * not turn that first session into one that opens with an advert.
   */
  const [onboardedAtLaunch] = useState(
    // Nor the launch that asks an existing user for their language.
    preferences.onboardingComplete && preferences.appLanguageChosen,
  );

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  /*
   * Onboarding replaces the navigator rather than being a route in it.
   *
   * Preferences are already loaded by this point — the provider renders
   * nothing until they are — so this decision is made once, with the real
   * answer, and never flickers from tabs to welcome and back.
   *
   * Rendering it *instead of* the Stack is what keeps the promise that there
   * is only ever one translator: there is no second copy to navigate to, and
   * no route a user could land back on with the system back button. Finishing
   * writes the preference, this re-renders, and the navigator mounts on its
   * own first tab.
   *
   * The flow owns which of its own screens is showing. This only knows whether
   * onboarding is done, which is the only part worth persisting.
   */
  const language = isAppLanguage(preferences.appLanguage)
    ? preferences.appLanguage
    : DEFAULT_APP_LANGUAGE;

  if (!preferences.onboardingComplete) {
    return (
      <I18nProvider language={language}>
        <OnboardingFlow
          onComplete={() => update({ onboardingComplete: true, appLanguageChosen: true })}
        />
      </I18nProvider>
    );
  }

  /*
   * Someone who used the app before it spoke other languages finished
   * onboarding without being asked. They are asked once, here, in place of the
   * navigator — the same way onboarding is shown — and never again.
   */
  if (!preferences.appLanguageChosen) {
    return (
      <I18nProvider language={language}>
        <LanguagePrompt />
      </I18nProvider>
    );
  }

  return (
    <I18nProvider language={language}>
      <ThemeProvider value={toNavigationTheme(theme)}>
        {/* Past onboarding only, by being down here: a first launch sees the
          welcome screen and the tour, never an advert. */}
        <AppOpenAdController showOnLaunch={onboardedAtLaunch} />
        {/* The navigator below starts again on Home; this returns to Settings. */}
        <ReturnToSettingsOnLanguageChange />
        {/* Keyed by language: changing it in Settings redraws every screen in
          the new language. Only the navigator is keyed, so the advert
          controller above keeps its state and does not fire again. */}
        <Stack
          key={language}
          screenOptions={{
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="translate/language-picker"
            options={{ headerShown: false, presentation: 'modal' }}
          />
          <Stack.Screen name="camera/result" options={{ headerShown: false }} />
          <Stack.Screen name="conversation" options={{ headerShown: false }} />
          <Stack.Screen name="phrases" options={{ headerShown: false }} />
          <Stack.Screen name="history/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="settings/language-packs" options={{ headerShown: false }} />
          <Stack.Screen name="settings/voice" options={{ headerShown: false }} />
          <Stack.Screen name="settings/app-language" options={{ headerShown: false }} />
          <Stack.Screen name="upgrade" options={{ headerShown: false }} />
          <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
        </Stack>
      </ThemeProvider>
    </I18nProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          {/* Wakes the translation server on opening and on every return to
              the app, onboarding included — see the component. */}
          <ServerWarmup />
          <RootNavigator />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
