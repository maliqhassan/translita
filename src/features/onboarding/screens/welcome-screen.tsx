import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Text } from '@/components';
import { APP, LEGAL } from '@/constants';
import { useResponsive, useTheme } from '@/hooks';

import { WelcomeIllustration } from '../components/welcome-illustration';

/**
 * The first thing a new install sees.
 *
 * A single screen rather than a carousel: there is one thing a first-time user
 * has to do, which is start, and every extra slide is a thing between them and
 * the app. It is also the only honest option right now — a tour needs artwork
 * and claims for each slide, and inventing either would be describing a
 * product rather than this one.
 *
 * Deliberately not a route. It renders in place of the navigator entirely (see
 * `app/_layout.tsx`), which means there is no second copy of the translator to
 * navigate to, no history entry to go back into, and no moment where the tabs
 * appear and are then replaced.
 *
 * It takes the whole screen including both safe areas, so the colour runs to
 * the top and the button stays clear of the Android navigation buttons.
 */
export function WelcomeScreen({ onGetStarted }: { onGetStarted: () => void }) {
  const theme = useTheme();
  const { isShort, width } = useResponsive();

  /**
   * Shown when the privacy policy has no URL yet.
   *
   * The link must not be a no-op, and it must not lie. With nothing published
   * there is nothing to open, so pressing it says so rather than failing
   * silently or opening a 404.
   */
  const [policyNote, setPolicyNote] = useState<string | undefined>(undefined);

  const openPrivacyPolicy = () => {
    if (!LEGAL.privacyPolicyUrl) {
      setPolicyNote(
        'The privacy policy is not published yet. It will be linked here before release.',
      );
      return;
    }

    // Failure is silent to the user by design: there is no browser to fall
    // back to, and blocking the welcome screen on it would be worse.
    void Linking.openURL(LEGAL.privacyPolicyUrl).catch(() => {
      setPolicyNote('That link could not be opened on this device.');
    });
  };

  // Big enough to be the thing you look at, small enough that a 5" phone still
  // shows the button without scrolling.
  const illustration = Math.min(width * (isShort ? 0.58 : 0.72), 320);

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.onboarding }}>
      {/* Light content, because the field is brand colour in both themes. */}
      <StatusBar
        // The field is the brand fill, which is light: the clock and icons
        // have to be dark on it, and only invert when the theme does.
        barStyle={theme.scheme === 'dark' ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.onboarding}
      />

      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom', 'left', 'right']}>
        <View
          style={{
            flex: 1,
            paddingHorizontal: theme.layout.screenPadding,
            paddingBottom: theme.spacing.lg,
          }}
        >
          {/* The illustration and the wordmark ride in the upper two thirds;
              the action sits at the bottom. The spacers rather than fixed
              offsets are what keeps that true on both a tall and a short
              phone. */}
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <WelcomeIllustration size={illustration} />

            <View
              style={{ alignItems: 'center', gap: theme.spacing.xs, marginTop: theme.spacing.xxl }}
            >
              <Text
                variant="display"
                color="onGradient"
                align="center"
                style={{ color: theme.colors.onOnboarding }}
              >
                {APP.name}
              </Text>
              <Text
                variant="bodyLarge"
                align="center"
                style={{ color: theme.colors.onOnboardingMuted }}
              >
                {APP.tagline}
              </Text>
            </View>
          </View>

          <View style={{ gap: theme.spacing.base }}>
            <Pressable
              onPress={onGetStarted}
              accessibilityRole="button"
              accessibilityLabel="Get started"
              accessibilityHint="Opens the translator"
              style={({ pressed }) => ({
                height: 56,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.lg,
                backgroundColor: theme.colors.onboardingAction,
                opacity: pressed ? theme.motion.opacityPressed : 1,
              })}
            >
              <Text variant="button" style={{ color: theme.colors.onOnboardingAction }}>
                Get Started
              </Text>
            </Pressable>

            <View style={{ alignItems: 'center', gap: theme.spacing.xxs }}>
              <Text
                variant="bodySmall"
                align="center"
                style={{ color: theme.colors.onOnboardingMuted }}
              >
                By tapping Get Started, you agree to our
              </Text>

              <Pressable
                onPress={openPrivacyPolicy}
                accessibilityRole="link"
                accessibilityLabel="Privacy Policy"
                hitSlop={theme.spacing.sm}
              >
                {({ pressed }) => (
                  <Text
                    variant="label"
                    align="center"
                    style={{
                      color: theme.colors.onOnboarding,
                      textDecorationLine: 'underline',
                      opacity: pressed ? theme.motion.opacityPressed : 1,
                    }}
                  >
                    Privacy Policy
                  </Text>
                )}
              </Pressable>

              {policyNote ? (
                <Text
                  variant="caption"
                  align="center"
                  style={{ color: theme.colors.onOnboardingMuted }}
                >
                  {policyNote}
                </Text>
              ) : null}
            </View>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}
