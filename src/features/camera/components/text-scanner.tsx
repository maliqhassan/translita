import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';

import { Button, Icon, Spinner, Text } from '@/components';
import { useTheme } from '@/hooks';

/**
 * The camera sheet: preview, one shutter, and nothing else.
 *
 * The only file in the app that imports `expo-camera`, the same
 * one-file-per-platform-API rule the other native surfaces follow. It knows
 * nothing about recognition — it hands a file path upward and the OCR service
 * does the rest.
 *
 * Permission is requested from here because this component only exists once
 * the user has tapped the scan control. Nothing asks for the camera at
 * start-up, and the sheet renders an explanation rather than a dead preview
 * when permission is refused.
 *
 * The capture is a temporary file. It is never uploaded and never logged.
 */

export type TextScannerProps = {
  visible: boolean;
  /** True while a capture is being read; the shutter is blocked meanwhile. */
  busy?: boolean;
  onCapture: (imageUri: string) => void;
  onClose: () => void;
};

export function TextScanner({ visible, busy = false, onCapture, onClose }: TextScannerProps) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);

  const takePicture = async () => {
    if (!ready || busy) return;

    const photo = await camera.current?.takePictureAsync({ skipProcessing: true });
    // No picture means the shutter failed; the sheet stays open so the user
    // can simply try again rather than being dropped back with nothing.
    if (photo?.uri) onCapture(photo.uri);
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: theme.colors.cameraSurface }}>
        {permission?.granted ? (
          <CameraView
            ref={camera}
            style={{ flex: 1 }}
            facing="back"
            onCameraReady={() => setReady(true)}
          />
        ) : (
          <PermissionPrompt
            /** Undefined until the first check resolves. */
            checked={permission !== null}
            canAskAgain={permission?.canAskAgain ?? true}
            onRequest={() => void requestPermission()}
          />
        )}

        <View
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            padding: theme.spacing.lg,
            gap: theme.spacing.md,
            alignItems: 'center',
          }}
        >
          {permission?.granted ? (
            <>
              <Text variant="caption" color="onCamera">
                {busy ? 'Reading the text…' : 'Point at the text and tap to scan'}
              </Text>

              <Pressable
                onPress={() => void takePicture()}
                disabled={!ready || busy}
                accessibilityRole="button"
                accessibilityLabel="Scan the text in view"
                accessibilityState={{ disabled: !ready || busy, busy }}
                style={{
                  width: 72,
                  height: 72,
                  borderRadius: theme.radius.full,
                  backgroundColor:
                    ready && !busy ? theme.colors.onCamera : theme.colors.onCameraMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {busy ? <Spinner /> : <Icon name="scan-outline" size={28} color="text" />}
              </Pressable>
            </>
          ) : null}

          <Button label="Cancel" variant="secondary" size="sm" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

/**
 * What the sheet shows instead of a preview when it cannot have one.
 *
 * The two refusals need different instructions: one can be asked again, the
 * other only changes in system settings.
 */
function PermissionPrompt({
  checked,
  canAskAgain,
  onRequest,
}: {
  checked: boolean;
  canAskAgain: boolean;
  onRequest: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.lg,
      }}
    >
      <Icon name="camera-outline" size={32} color="textMuted" />

      {!checked ? (
        <Text variant="bodySmall" color="onCamera" align="center">
          Checking camera access…
        </Text>
      ) : canAskAgain ? (
        <>
          <Text variant="bodySmall" color="onCamera" align="center">
            Translita needs the camera to scan text. Nothing is uploaded — the picture is read on
            this device and then discarded.
          </Text>
          <Button label="Allow camera" onPress={onRequest} size="sm" />
        </>
      ) : (
        <Text variant="bodySmall" color="onCamera" align="center">
          Camera access is turned off for Translita. It can be re-enabled in the system settings for
          this app.
        </Text>
      )}
    </View>
  );
}
