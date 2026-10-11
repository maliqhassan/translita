import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FEATURES, UNAVAILABLE_INPUT_MESSAGES } from '@/constants';
import { t } from '@/i18n';
import { resolveFeatureAccess, services } from '@/services';
import { useEntitlements } from '@/store';
import type { AppError } from '@/types';

/**
 * Scanning text with the camera, as the translate screen needs it.
 *
 * Owns the flow, the state a control renders from, and the entitlement
 * decision; the screen never sees the camera, the recogniser or the plan.
 * Opening the scanner is the only thing that can ask for the camera
 * permission, and it happens on a tap and nowhere else.
 *
 * Three things have to be true before a scan can start, and they are checked
 * in this order: the capability has shipped, the device can do it, and the
 * plan includes it. The order decides what the user is told — a phone with no
 * recogniser reads as unavailable and is never offered an upgrade, because
 * upgrading would not give it one.
 *
 * Recognised text is handed to the caller and nothing else — not logged, and
 * not translated automatically. The user reads it, fixes anything the
 * recogniser misread, and presses Translate themselves, exactly as with typed
 * or dictated text.
 */

export type ScanStatus =
  /** No recogniser in this build or on this device. Never an upsell. */
  | 'unavailable'
  /** The device could scan, but this plan does not include it. */
  | 'locked'
  | 'idle'
  /** The camera sheet is open and waiting for a capture. */
  | 'scanning'
  /** A capture is being read. */
  | 'recognizing'
  | 'error';

/** The part of the status the flow owns, once the gate has let it through. */
type ScanFlow = 'idle' | 'scanning' | 'recognizing' | 'error';

export type CameraOcrController = {
  status: ScanStatus;
  /** True while the camera sheet should be presented. */
  scanning: boolean;
  busy: boolean;
  error?: AppError;
  /**
   * Why a tap did nothing, when the control was tapped where scanning cannot
   * run. Ready to show as it is.
   */
  notice?: string;
  /**
   * Opens the scanner. The only path to a camera permission request.
   *
   * Where scanning cannot run it opens nothing and sets `notice` instead, so
   * the control can stay on screen and still answer a tap.
   */
  open: () => void;
  /** Closes the scanner without reading anything. */
  close: () => void;
  /** Called by the scanner with the captured file. */
  capture: (imageUri: string) => void;
  /** Opens the upgrade screen. Does nothing unless the status is `locked`. */
  upgrade: () => void;
  dismissError: () => void;
};

export function useCameraOcr(onText: (text: string) => void): CameraOcrController {
  const router = useRouter();
  const { has, loaded } = useEntitlements();

  const [flow, setFlow] = useState<ScanFlow>('idle');
  const [error, setError] = useState<AppError | undefined>(undefined);
  /** Set by a tap on a control that could not run; cleared by dismissing. */
  const [tappedUnavailable, setTappedUnavailable] = useState(false);
  /**
   * Undefined until the recogniser has answered for itself — except when the
   * capability is not in this build, where there is nothing to ask and the
   * answer is known before the first render.
   */
  const [supported, setSupported] = useState<boolean | undefined>(
    FEATURES.cameraOcr ? undefined : false,
  );

  const mounted = useRef(true);
  /** Rejects a second capture while one is still being read. */
  const reading = useRef(false);

  const handler = useRef(onText);
  useEffect(() => {
    handler.current = onText;
  });

  useEffect(() => {
    mounted.current = true;

    // The device is asked only when the capability shipped, so a build
    // without it never probes the recogniser at all.
    if (FEATURES.cameraOcr) {
      void services.ocr.isAvailable().then((can) => {
        if (mounted.current) setSupported(can);
      });
    }

    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Nothing is offered until both answers are in.
   *
   * Treating the unresolved moment as `unavailable` rather than `locked` is
   * what stops a Pro user seeing the lock flash up before their plan arrives.
   */
  const access =
    supported === undefined || !loaded
      ? 'unavailable'
      : resolveFeatureAccess({
          shipped: FEATURES.cameraOcr,
          supported,
          entitled: has('cameraOcr'),
        });

  const allowed = access === 'allowed';

  // The gate wins over the flow, so a plan that changes mid-session closes
  // whatever was open rather than leaving a scanner running behind a lock.
  const status: ScanStatus = allowed ? flow : access;

  /*
   * Derived rather than stored, so it follows the answers as they arrive: a
   * tap in the first moment reads "getting ready", becomes the real reason if
   * the device says no, and disappears on its own if the device says yes.
   */
  const notice =
    tappedUnavailable && access === 'unavailable'
      ? supported === false
        ? t(UNAVAILABLE_INPUT_MESSAGES.scan)
        : t(UNAVAILABLE_INPUT_MESSAGES.pending)
      : undefined;

  const open = useCallback(() => {
    if (!allowed) {
      // Explains rather than does nothing. A locked control leads to the
      // upgrade screen through `upgrade`, never through here.
      if (access === 'unavailable') setTappedUnavailable(true);
      return;
    }
    setTappedUnavailable(false);
    setError(undefined);
    setFlow('scanning');
  }, [access, allowed]);

  const close = useCallback(() => {
    reading.current = false;
    setFlow('idle');
  }, []);

  const capture = useCallback(
    (imageUri: string) => {
      // Guarded here as well as at `open`, so no path can reach the recogniser
      // without the entitlement — not a stale callback, not a sheet left open.
      if (!allowed || reading.current) return;
      reading.current = true;
      setFlow('recognizing');

      void (async () => {
        const result = await services.ocr.recognize({ imageUri });
        reading.current = false;
        if (!mounted.current) return;

        if (!result.ok) {
          // A failed read leaves the draft exactly as it was: no stale text, no
          // half-recognised fragment, nothing invented.
          setError(result.error);
          setFlow('error');
          return;
        }

        handler.current(result.value.fullText);
        setFlow('idle');
      })();
    },
    [allowed],
  );

  const upgrade = useCallback(() => {
    // Only a locked feature may lead to the paywall. A device that cannot
    // scan is never offered something that would not help it.
    if (access !== 'locked') return;
    router.push('/upgrade');
  }, [access, router]);

  return {
    status,
    scanning: status === 'scanning' || status === 'recognizing',
    busy: status === 'recognizing',
    error,
    notice,
    open,
    close,
    capture,
    upgrade,
    dismissError: useCallback(() => {
      setTappedUnavailable(false);
      setError(undefined);
      setFlow((current) => (current === 'error' ? 'idle' : current));
    }, []),
  };
}
