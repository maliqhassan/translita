import { useIsFocused, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { FEATURES } from '@/constants';
import { resolveFeatureAccess, services } from '@/services';
import { useEntitlements } from '@/store';
import type { AppError, LanguageCode } from '@/types';
import { appError } from '@/utils';

/**
 * The microphone, as the translate screen needs it.
 *
 * Owns one recognition session at a time, the entitlement decision, and the
 * state a button renders from. The screen never sees the platform recogniser
 * or the user's plan; it sees this.
 *
 * Three things must hold before a session can start, checked in this order:
 * the capability shipped, the device can do it, and the plan includes it. The
 * order decides what the user is told — a phone with no recogniser reads as
 * unavailable and is never offered an upgrade, because upgrading would not
 * give it one. The rule itself is `resolveFeatureAccess`, shared with the
 * camera gate so the two cannot drift apart.
 *
 * Note the two names for the same feature: `FEATURES.speechInput` is the build
 * flag this shipped under, and `speechRecognition` is the capability it is
 * sold as. They are deliberately separate layers — one says what is in the
 * build, the other what the user has paid for.
 *
 * Recognised text is handed to the caller and nothing else. It is not logged
 * here or below, and it is not translated automatically — the user reads it,
 * edits it if the recogniser misheard, and presses Translate themselves. That
 * matches how typed text already behaves on this screen.
 */

export type SpeechStatus =
  /** The device cannot do this at all, or the capability has not shipped. */
  | 'unavailable'
  /** The device could listen, but this plan does not include it. */
  | 'locked'
  /** Ready to start. */
  | 'idle'
  /** Waiting on the permission dialog the user just triggered. */
  | 'requesting_permission'
  | 'listening'
  /** Permission refused, but it can be asked for again. */
  | 'permission_denied'
  /** Permission refused permanently; only system settings can change it. */
  | 'permission_blocked'
  | 'error';

/** The part of the status the session owns, once the gate has let it through. */
type SpeechFlow = Exclude<SpeechStatus, 'unavailable' | 'locked'>;

export type SpeechController = {
  status: SpeechStatus;
  /** True while a session is running, for the button's pressed state. */
  listening: boolean;
  /** Set on the failure states, for an actionable message. */
  error?: AppError;
  /** Starts if idle, stops if listening. One control, one meaning. */
  toggle: (language: LanguageCode) => void;
  /** Opens the upgrade screen. Does nothing unless the status is `locked`. */
  upgrade: () => void;
  dismissError: () => void;
};

export type SpeechRecognitionCallbacks = {
  /** Interim text, replaced as the recogniser revises it. */
  onPartial: (transcript: string) => void;
  /** The settled transcript. */
  onFinal: (transcript: string) => void;
};

export function useSpeechRecognition(callbacks: SpeechRecognitionCallbacks): SpeechController {
  const router = useRouter();
  const isFocused = useIsFocused();
  const { has, loaded } = useEntitlements();

  const [flow, setFlow] = useState<SpeechFlow>('idle');
  const [error, setError] = useState<AppError | undefined>(undefined);
  /**
   * Undefined until the recogniser has answered for itself — except when the
   * capability is not in this build, where there is nothing to ask and the
   * answer is known before the first render.
   */
  const [supported, setSupported] = useState<boolean | undefined>(
    FEATURES.speechInput ? undefined : false,
  );

  /**
   * Refs, not state: `toggle` must see the true session state synchronously to
   * reject a second tap, and a state update is not visible until the next
   * render.
   */
  const busy = useRef(false);
  const mounted = useRef(true);

  /**
   * Kept in a ref so the event subscription never needs re-creating, and
   * updated in an effect rather than during render — a ref written while
   * rendering can be torn between a discarded render and the committed one.
   */
  const handlers = useRef(callbacks);
  useEffect(() => {
    handlers.current = callbacks;
  });

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
          shipped: FEATURES.speechInput,
          supported,
          entitled: has('speechRecognition'),
        });

  const allowed = access === 'allowed';

  /**
   * The same answer, readable from inside the subscription.
   *
   * The subscription is created once and must not be re-created on every plan
   * change, so it cannot close over `allowed` directly.
   */
  const allowedNow = useRef(allowed);
  useEffect(() => {
    allowedNow.current = allowed;
  }, [allowed]);

  /**
   * The same guard, for focus.
   *
   * The recogniser is one session shared by the whole app, and a navigation
   * stack keeps the screen behind the new one mounted rather than destroying
   * it. Without this, its subscription stays live in the background right
   * alongside the screen now in front, and a result meant for the one on
   * screen reaches both — heard on the Conversation screen, it would still
   * land in the Translate screen's own draft, sitting unseen underneath.
   */
  const focusedNow = useRef(isFocused);
  useEffect(() => {
    focusedNow.current = isFocused;
  }, [isFocused]);

  /**
   * Losing focus closes the microphone, exactly as losing the entitlement
   * does below. A session left running behind the screen that opened it would
   * keep listening for words meant for whatever is now in front.
   */
  useEffect(() => {
    if (isFocused || !busy.current) return;
    busy.current = false;
    void services.speech.cancel();
  }, [isFocused]);

  useEffect(() => {
    mounted.current = true;

    // The device is asked only when the capability shipped, so a build
    // without it never probes the recogniser at all.
    if (FEATURES.speechInput) {
      void services.speech.isAvailable().then((can) => {
        if (mounted.current) setSupported(can);
      });
    }

    const unsubscribe = services.speech.subscribe((event) => {
      if (!mounted.current) return;

      switch (event.type) {
        case 'partial':
          // Guarded as well as `toggle`, so no transcript can reach the draft
          // without the entitlement — not from a session that outlived a plan
          // change, not from anything else already in flight — and not from a
          // screen that is no longer the one on screen.
          if (!allowedNow.current || !focusedNow.current) return;
          handlers.current.onPartial(event.transcript);
          break;
        case 'final':
          if (!allowedNow.current || !focusedNow.current) return;
          handlers.current.onFinal(event.transcript);
          break;
        case 'error':
          busy.current = false;
          setError(event.error);
          setFlow(event.error.code === 'permission_denied' ? 'permission_denied' : 'error');
          break;
        case 'end':
          busy.current = false;
          // Errors set their own status; a normal end returns to idle.
          setFlow((current) => (current === 'listening' ? 'idle' : current));
          break;
        case 'volume':
          break;
      }
    });

    return () => {
      mounted.current = false;
      unsubscribe();
      // Leaving the screen must not leave the microphone open.
      void services.speech.cancel();
    };
  }, []);

  /**
   * Losing the entitlement closes the microphone.
   *
   * The status would already read `locked`, but a hardware resource left open
   * behind a lock is a privacy problem, not a cosmetic one. Cancelling emits
   * `end`, which returns the flow to idle through the subscription above — so
   * nothing is set synchronously here.
   */
  useEffect(() => {
    if (allowed || !busy.current) return;
    busy.current = false;
    void services.speech.cancel();
  }, [allowed]);

  // The gate wins over the session, so a plan that changes mid-session can
  // never leave a listening control on screen.
  const status: SpeechStatus = allowed ? flow : access;

  const toggle = useCallback(
    (language: LanguageCode) => {
      if (!allowed) return;

      // Rejects both a double start and a double stop.
      if (busy.current) {
        busy.current = false;
        setFlow('idle');
        void services.speech.stop();
        return;
      }

      busy.current = true;
      setError(undefined);
      setFlow('requesting_permission');

      void (async () => {
        const permitted = await services.speech.requestPermission();

        // Refused for good: only system settings can change it now.
        if (!permitted.ok) {
          busy.current = false;
          if (!mounted.current) return;
          setError(permitted.error);
          setFlow('permission_blocked');
          return;
        }

        // Refused this time; the dialog can be offered again on the next tap.
        if (!permitted.value) {
          busy.current = false;
          if (!mounted.current) return;
          setError(appError('permission_denied', 'Microphone access is needed to listen.'));
          setFlow('permission_denied');
          return;
        }

        // Re-checked after the await: the plan can change while a permission
        // dialog is up, and starting then would open the microphone for a
        // user who is no longer entitled to it.
        if (!allowedNow.current) {
          busy.current = false;
          return;
        }

        const started = await services.speech.start({ language, interimResults: true });

        if (!mounted.current) return;
        if (started.ok) {
          setFlow('listening');
          return;
        }

        busy.current = false;
        setError(started.error);
        setFlow('error');
      })();
    },
    [allowed],
  );

  const upgrade = useCallback(() => {
    // Only a locked feature may lead to the paywall. A device that cannot
    // listen is never offered something that would not help it.
    if (access !== 'locked') return;
    router.push('/upgrade');
  }, [access, router]);

  return {
    status,
    listening: status === 'listening',
    error,
    toggle,
    upgrade,
    dismissError: useCallback(() => setError(undefined), []),
  };
}
