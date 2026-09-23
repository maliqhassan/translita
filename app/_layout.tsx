import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  type Theme as NavigationTheme,
} from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import type { Theme } from '@/constants';
import { useTheme } from '@/hooks';
import { AppProviders } from '@/store';

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

  useEffect(() => {
    void SplashScreen.hideAsync();
  }, []);

  return (
    <ThemeProvider value={toNavigationTheme(theme)}>
      <Stack
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
        <Stack.Screen name="history/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="settings/language-packs" options={{ headerShown: false }} />
        <Stack.Screen name="settings/voice" options={{ headerShown: false }} />
        <Stack.Screen name="upgrade" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" options={{ title: 'Not found' }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppProviders>
          <RootNavigator />
        </AppProviders>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
