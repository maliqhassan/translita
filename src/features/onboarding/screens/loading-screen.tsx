import { useEffect, useState } from 'react';
import { Animated, Easing, Image, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { APP } from '@/constants';
import { useTheme } from '@/hooks';
import { deviceAppLanguage, t } from '@/i18n';
import { usePreferences } from '@/store';

/** The same artwork as the launcher icon and the native splash. */
const LOGO = require('../../../../assets/images/logo-mark.png') as number;
const LOGO_WIDTH = 120;
/** The artwork's own proportions (240×196), so it never stretches. */
const LOGO_ASPECT = 240 / 196;

/** Long enough to read the name, short enough not to be in the way. */
const DURATION_MS = 1600;

/**
 * The first thing a new install shows: the brand, while the app gets ready.
 *
 * It picks up where the native splash leaves off — the same logo on the same
 * page colour — and adds the name and a line about what the app does, with a
 * bar that fills once and moves on. Shown on the first launch only; after
 * onboarding the app opens straight onto Home.
 *
 * It also starts the app in the phone's own language, so this screen and the
 * language choice after it already read in it when the app speaks it.
 */
export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const theme = useTheme();
  const { update } = usePreferences();
  const [progress] = useState(() => new Animated.Value(0));

  useEffect(() => {
    update({ appLanguage: deviceAppLanguage() });
    // Once, on arrival: the language screen takes it from here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const fill = Animated.timing(progress, {
      toValue: 1,
      duration: DURATION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    fill.start(({ finished }) => {
      if (finished) onDone();
    });
    return () => fill.stop();
    // Runs once; `onDone` only moves the flow on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const width = progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <StatusBar
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            gap: theme.spacing.md,
            paddingHorizontal: theme.layout.screenPadding,
          }}
        >
          <Image
            source={LOGO}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            resizeMode="contain"
            style={{ width: LOGO_WIDTH, height: LOGO_WIDTH / LOGO_ASPECT }}
          />
          <Text variant="display" align="center">
            {APP.name}
          </Text>
          <Text variant="bodyLarge" color="textSecondary" align="center">
            {t('Your pocket translator, online and offline')}
          </Text>
        </View>

        <View
          accessibilityRole="progressbar"
          accessibilityLabel={t('Loading…')}
          style={{
            alignSelf: 'center',
            width: '40%',
            height: theme.spacing.xs,
            marginBottom: theme.spacing.xxl,
            borderRadius: theme.radius.full,
            overflow: 'hidden',
            backgroundColor: theme.colors.primaryMuted,
          }}
        >
          <Animated.View style={{ width, height: '100%', backgroundColor: theme.colors.primary }} />
        </View>
      </SafeAreaView>
    </View>
  );
}
