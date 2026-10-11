import * as Linking from 'expo-linking';
import { useState } from 'react';
import { Pressable, StatusBar, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, Icon, Text, type IconName } from '@/components';
import { APP, LEGAL } from '@/constants';
import { useResponsive, useTheme } from '@/hooks';
import { msg, t } from '@/i18n';

import { WelcomeIllustration } from '../components/welcome-illustration';

/**
 * The ways in, named under the tagline. Each is a real control in the
 * translator, so the row describes the app rather than advertising it.
 */
const HIGHLIGHTS: readonly { icon: IconName; label: string }[] = [
  { icon: 'text-outline', label: msg('Type') },
  { icon: 'mic-outline', label: msg('Speak') },
  { icon: 'scan-outline', label: msg('Scan') },
  { icon: 'cloud-download-outline', label: msg('Offline') },
];

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
 * It takes the whole screen including both safe areas, so the page runs to
 * the top and the button stays clear of the Android navigation buttons.
 *
 * White, like the app it opens into, with the brand blue kept for the
 * artwork's tints and the one button. It used to be a full field of cyan,
 * which was heavy, and made the first screen look like a different product
 * from the second.
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
        t('The privacy policy is not published yet. It will be linked here before release.'),
      );
      return;
    }

    // Failure is silent to the user by design: there is no browser to fall
    // back to, and blocking the welcome screen on it would be worse.
    void Linking.openURL(LEGAL.privacyPolicyUrl).catch(() => {
      setPolicyNote(t('That link could not be opened on this device.'));
    });
  };

  // Big enough to be the thing you look at, small enough that a 5" phone still
  // shows the button without scrolling.
  const illustration = Math.min(width * (isShort ? 0.5 : 0.66), 280);

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
              <Text variant="display" align="center">
                {APP.name}
              </Text>
              <Text variant="bodyLarge" color="textSecondary" align="center">
                {APP.tagline}
              </Text>
            </View>

            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                justifyContent: 'center',
                gap: theme.spacing.sm,
                marginTop: theme.spacing.lg,
              }}
            >
              {HIGHLIGHTS.map((item) => (
                <View
                  key={t(item.label)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: theme.spacing.xs,
                    paddingHorizontal: theme.spacing.md,
                    paddingVertical: theme.spacing.xs,
                    borderRadius: theme.radius.full,
                    backgroundColor: theme.colors.primaryMuted,
                  }}
                >
                  <Icon name={item.icon} size={16} color="primaryStrong" />
                  <Text variant="label" color="primaryStrong" maxFontSizeMultiplier={1.3}>
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <View style={{ gap: theme.spacing.base }}>
            <Button
              label={t('Get Started')}
              icon="arrow-forward"
              iconPosition="right"
              size="lg"
              fullWidth
              onPress={onGetStarted}
              accessibilityHint={t('Opens a short tour of the app')}
            />

            <View style={{ alignItems: 'center', gap: theme.spacing.xxs }}>
              <Text variant="bodySmall" color="textSecondary" align="center">
                {t('By tapping Get Started, you agree to our')}
              </Text>

              <Pressable
                onPress={openPrivacyPolicy}
                accessibilityRole="link"
                accessibilityLabel={t('Privacy Policy')}
                hitSlop={theme.spacing.sm}
              >
                {({ pressed }) => (
                  <Text
                    variant="label"
                    color="primaryStrong"
                    align="center"
                    style={{
                      textDecorationLine: 'underline',
                      opacity: pressed ? theme.motion.opacityPressed : 1,
                    }}
                  >
                    {t('Privacy Policy')}
                  </Text>
                )}
              </Pressable>

              {policyNote ? (
                <Text variant="caption" color="textSecondary" align="center">
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
