import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { View } from 'react-native';

import { Badge, Button, Card, EmptyState, GradientHeader, Icon, Screen, Text } from '@/components';
import { errorMessage } from '@/constants';
import { useCameraOcr } from '@/features/translation';
import { useTheme } from '@/hooks';

import { TextScanner } from '../components/text-scanner';
import { setPendingScan } from '../pending-scan';

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

  const unavailable = scan.status === 'unavailable';
  const locked = scan.status === 'locked';

  return (
    <Screen
      headerBleed
      header={<GradientHeader title="Camera" subtitle="Point at text to translate it" />}
    >
      {unavailable ? (
        <EmptyState
          icon="phone-portrait-outline"
          title="Scanning is not in this build"
          description="Text recognition needs the native module, which is only present in a development or release build of the app."
        />
      ) : locked ? (
        <View style={{ flex: 1, gap: theme.spacing.base, justifyContent: 'center' }}>
          <Card variant="outlined" style={{ gap: theme.spacing.md, alignItems: 'center' }}>
            <Icon name="lock-closed-outline" size={40} color="primary" />

            <Badge label="Pro" tone="primary" />

            <Text variant="body" align="center">
              Camera text recognition is part of Translita Pro
            </Text>
            <Text variant="bodySmall" color="textSecondary" align="center">
              Your device can read text from a picture. Pro turns it on, along with speech-to-text,
              offline translation and an ad-free app.
            </Text>

            <Button
              label="See what Pro includes"
              icon="sparkles-outline"
              size="lg"
              fullWidth
              onPress={scan.upgrade}
              accessibilityHint="Opens the Translita Pro screen"
            />
          </Card>
        </View>
      ) : (
        <View style={{ flex: 1, gap: theme.spacing.base, justifyContent: 'center' }}>
          <Card variant="outlined" style={{ gap: theme.spacing.md, alignItems: 'center' }}>
            <Icon name="scan-outline" size={40} color="primary" />

            <Text variant="body" align="center">
              Scan a menu, a sign or a page
            </Text>
            <Text variant="bodySmall" color="textSecondary" align="center">
              The picture is read on this device and then discarded. Recognised text goes into the
              translate box, where you can correct it before translating.
            </Text>

            <Button
              label="Open camera"
              icon="camera-outline"
              size="lg"
              fullWidth
              onPress={scan.open}
              accessibilityHint="Opens the camera to read text from a picture"
            />
          </Card>

          {scan.error ? (
            <Card variant="outlined">
              <Text variant="bodySmall" color="warning">
                {errorMessage(scan.error)}
              </Text>
            </Card>
          ) : null}
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
