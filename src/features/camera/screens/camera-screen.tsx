import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import {
  Badge,
  Button,
  Card,
  Divider,
  EmptyState,
  Icon,
  ListItem,
  Screen,
  ScreenHeader,
  SectionHeader,
  Text,
  type IconName,
} from '@/components';
import { errorMessage } from '@/constants';
import { useInterstitialAds } from '@/features/ads';
import { BrandMark, useCameraOcr } from '@/features/translation';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';

import { TextScanner } from '../components/text-scanner';
import { setPendingScan } from '../pending-scan';

/**
 * What makes the recogniser succeed, said before the user tries.
 *
 * The last one is a real limit, not advice: the bundled on-device recogniser
 * reads Latin script only, so saying so up front beats a scan that returns
 * nothing from a page of Arabic or Chinese.
 */
const CAMERA_TIPS: readonly { icon: IconName; title: string; subtitle: string }[] = [
  {
    icon: 'expand-outline',
    title: msg('Fill the frame'),
    subtitle: msg('Get close enough that the text is large'),
  },
  {
    icon: 'sunny-outline',
    title: msg('Use good light'),
    subtitle: msg('Avoid glare and deep shadow on the page'),
  },
  {
    icon: 'text-outline',
    title: msg('Latin-script text'),
    subtitle: msg('Reads English, Spanish, German and other Latin-script languages'),
  },
];

/**
 * The Camera tab: scan text, then hand it to the translate screen.
 *
 * It used to be a signpost telling the user to go and use the button on
 * another tab, which is a poor answer to someone who has just tapped Camera.
 * It now opens the same scanner and the same OCR service; the only extra piece
 * is handing the recognised text across the tab boundary.
 *
 * Translating still does not happen on its own. The text lands in the draft
 * and the user presses Translate, exactly as with typing, dictation, or the
 * scan button on the translate screen itself.
 *
 * Three states, and the two that are not the scanner are kept apart on
 * purpose. "Not in this build" is a fact about the device and offers nothing;
 * "part of Pro" is a fact about the plan and offers an upgrade. Mixing them
 * would either sell a feature that cannot run here, or hide one that can.
 * Which of the three applies is the controller's decision, not this screen's.
 */
export function CameraScreen() {
  const theme = useTheme();
  const router = useRouter();

  const scan = useCameraOcr(
    useCallback(
      (text: string) => {
        setPendingScan(text);
        // The translate screen collects it when it comes into focus.
        router.replace('/');
      },
      [router],
    ),
  );

  const ads = useInterstitialAds();

  const unavailable = scan.status === 'unavailable';
  const locked = scan.status === 'locked';

  return (
    <Screen
      wash
      scrollable
      header={<ScreenHeader compact title={t('Camera')} leading={<BrandMark />} />}
    >
      {unavailable ? (
        <EmptyState
          icon="phone-portrait-outline"
          title={t('Scanning is not in this build')}
          description={t(
            'Text recognition needs the native module, which is only present in a development or release build of the app.',
          )}
        />
      ) : locked ? (
        <View style={{ gap: theme.spacing.base }}>
          <Card
            variant="glass"
            padding="lg"
            style={{ gap: theme.spacing.md, alignItems: 'center' }}
          >
            <Icon name="lock-closed-outline" size={40} color="primary" />

            <Badge label={t('Pro')} tone="primary" />

            <Text variant="body" align="center">
              {t('Camera text recognition is part of Translita Pro')}
            </Text>
            <Text variant="bodySmall" color="textSecondary" align="center">
              {t(
                'Your device can read text from a picture. Pro turns it on, along with speech-to-text, offline translation and an ad-free app.',
              )}
            </Text>

            <Button
              label={t('See what Pro includes')}
              icon="sparkles-outline"
              size="lg"
              fullWidth
              onPress={scan.upgrade}
              accessibilityHint={t('Opens the Translita Pro screen')}
            />
          </Card>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.base }}>
          <Card
            variant="glass"
            padding="lg"
            style={{ gap: theme.spacing.base, alignItems: 'center' }}
          >
            <View
              style={{
                width: 96,
                height: 96,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: theme.radius.full,
                backgroundColor: theme.colors.primaryMuted,
              }}
            >
              <Icon name="scan-outline" size={44} color="primary" />
            </View>

            <View style={{ gap: theme.spacing.xs, alignItems: 'center' }}>
              <Text variant="h3" align="center">
                {t('Scan a menu, a sign or a page')}
              </Text>
              <Text variant="bodySmall" color="textSecondary" align="center">
                {t(
                  'The picture is read on this device and then discarded. The text lands in the translate box, where you can correct it before translating.',
                )}
              </Text>
            </View>

            <Button
              label={t('Open camera')}
              icon="camera-outline"
              size="lg"
              fullWidth
              // After an ad, when one is due; closing it opens the camera.
              onPress={() => ads.openAfterAd(scan.open)}
              accessibilityHint={t('Opens the camera to read text from a picture')}
              style={{
                borderRadius: theme.radius.full,
                height: theme.layout.minTouchTarget + theme.spacing.base,
              }}
            />
          </Card>

          {scan.error ? (
            <Card variant="glass">
              <Text variant="bodySmall" color="warning">
                {errorMessage(scan.error)}
              </Text>
            </Card>
          ) : null}

          <View>
            <SectionHeader title={t('For a clean scan')} />
            <Card variant="glass" padding="none">
              {CAMERA_TIPS.map((tip, index) => (
                <View key={tip.title}>
                  {index > 0 ? <Divider inset={theme.spacing.base} /> : null}
                  <ListItem icon={tip.icon} title={t(tip.title)} subtitle={t(tip.subtitle)} />
                </View>
              ))}
            </Card>
          </View>
        </View>
      )}

      <TextScanner
        visible={scan.scanning}
        busy={scan.busy}
        onCapture={scan.capture}
        onClose={scan.close}
      />
    </Screen>
  );
}
