import { Tabs } from 'expo-router';

import { AppTabBar, type TabIcons } from '@/components';
import { PlanBannerAd } from '@/features/ads';
import { msg, t } from '@/i18n';

type TabConfig = {
  name: string;
  title: string;
};

/** Declaring tabs as data keeps the layout free of repeated JSX. */
const TABS: readonly TabConfig[] = [
  { name: 'index', title: msg('Translate') },
  { name: 'camera', title: msg('Camera') },
  { name: 'history', title: msg('History') },
  { name: 'settings', title: msg('Settings') },
];

/** Filled when selected, outlined otherwise — the usual Ionicons pairing. */
const TAB_ICONS: TabIcons = {
  index: { inactive: 'home-outline', active: 'home' },
  camera: { inactive: 'camera-outline', active: 'camera' },
  history: { inactive: 'time-outline', active: 'time' },
  settings: { inactive: 'settings-outline', active: 'settings' },
};

export default function TabsLayout() {
  return (
    <Tabs
      // The bar is ours: a floating rounded pill rather than a full-width
      // strip. It handles its own safe-area inset, which is what keeps it
      // clear of the Android gesture bar and the back/home/recents buttons.
      /*
       * The free plan's banner rides directly above the bar, in the same slot.
       *
       * Putting it here rather than in a screen is what makes the placement
       * safe: it is outside every scroll view, so no amount of content can
       * push it over a translation, and it cannot be duplicated per tab.
       */
      tabBar={(props) => (
        <>
          <PlanBannerAd />
          <AppTabBar {...props} icons={TAB_ICONS} />
        </>
      )}
      screenOptions={{ headerShown: false }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t(tab.title) }} />
      ))}
    </Tabs>
  );
}
