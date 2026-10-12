import { Stack } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PlanBannerAd } from '@/features/ads';
import { useTheme } from '@/hooks';

/**
 * The translator and the screens it opens: Camera, History and Settings.
 *
 * A stack rather than tabs. Home already has a button for each of them, and
 * the settings gear sits in its header, so a bar repeating them took space
 * and said nothing new. Each opens over Home with a way back.
 *
 * The free plan's banner rides at the bottom of all four, in the slot the
 * tab bar used. Outside every scroll view, so no content can push it over a
 * translation, and drawn once here so it cannot be duplicated per screen.
 * It keeps clear of the system's own buttons on a phone that reports no
 * bottom inset, as the tab bar did.
 */
export default function MainLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack screenOptions={{ headerShown: false }} />
      <PlanBannerAd />
      <View style={{ height: Math.max(insets.bottom, theme.layout.tabBarFloorInset) }} />
    </View>
  );
}
