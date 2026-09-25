import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

import { isAutoDetect } from '@/constants';
import type { Unsubscribe } from '@/types';
import { appError, createLogger, err, ok } from '@/utils';

import type { ServiceResult } from '../types';

import type {
  SpeechRecognitionEvent,
  SpeechRecognitionOptions,
  SpeechService,
} from './speech-service';

const log = createLogger('speech');

/**
 * Microphone to text, over the platform's own speech recogniser.
 *
 * The only file in the app that imports `expo-speech-recognition`, the same
 * rule that keeps expo-sqlite, expo-clipboard and expo-speech each in one
 * place. Everything above sees `SpeechService`.
 *
 * **This is not offline.** On Android the recogniser is a system service —
 * usually the Google app — and by default it streams audio to Google's servers.
 * Some devices support on-device recognition, and `supportsOnDevice` reports
 * whether this one does, but nothing here assumes it. Speech recognition is a
 * separate capability from offline translation and makes no claim on that
 * guarantee.
 *
 * Recognised speech is the user's own words. It is never logged, and native
 * error messages — which can quote what was heard — never cross this boundary;
 * only a coarse code does.
 */

/** The subset of the native module this service uses. */
export type SpeechRecognitionNative = {
  isRecognitionAvailable(): boolean;
  supportsOnDeviceRecognition(): boolean;
  getPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  requestPermissionsAsync(): Promise<{ granted: boolean; canAskAgain: boolean }>;
  start(options: { lang?: string; interimResults?: boolean; continuous?: boolean }): void;
  stop(): void;
  abort(): void;
  addListener(event: string, listener: (payload: never) => void): { remove(): void };
};

/**
 * Permission refused in a way only system settings can undo.
 *
 * The three permission outcomes are carried by the Result itself rather than
 * by inspecting a message: `ok(true)` granted, `ok(false)` refused but still
 * askable, `err` refused for good. "Ask again" and "open settings" are
 * different instructions, and a screen has to be able to tell them apart.
 */
function blockedError() {
  return appError(
    'permission_denied',
    'Microphone access is turned off for Translita. It can be re-enabled in system settings.',
  );
}

/** Native recogniser codes, mapped without letting a message through. */
function toAppError(code: string) {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return appError('permission_denied', 'Speech recognition was not permitted.');
    case 'language-not-supported':
      return appError('unsupported_language', 'That language cannot be recognised on this device.');
    case 'network':
      return appError('network_unavailable', 'Speech recognition needs a connection right now.');
    case 'no-speech':
      return appError('invalid_request', 'Nothing was heard. Try speaking again.');
    case 'aborted':
      return appError('cancelled', 'Listening was cancelled.');
    case 'audio-capture':
      return appError('service_unavailable', 'The microphone could not be used.');
    default:
      return appError('unknown', 'Speech could not be recognised.');
  }
}

export function createExpoSpeechRecognitionService(
  native: SpeechRecognitionNative | null = ExpoSpeechRecognitionModule as SpeechRecognitionNative,
): SpeechService {
  const listeners = new Set<(event: SpeechRecognitionEvent) => void>();
  /** Native subscriptions held only while a session is running. */
  let subscriptions: { remove(): void }[] = [];
  let listening = false;

  const emit = (event: SpeechRecognitionEvent) => {
    for (const listener of listeners) listener(event);
  };

  function teardown() {
    for (const subscription of subscriptions) subscription.remove();
    subscriptions = [];
    listening = false;
  }

  return {
    id: 'speech.expo',

    async isAvailable() {
      if (!native) return false;
      try {
        return native.isRecognitionAvailable();
      } catch (cause) {
        log.warn('could not read recogniser availability', cause);
        return false;
      }
    },

    async requestPermission(): ServiceResult<boolean> {
      if (!native) {
        return err(appError('not_implemented', 'Speech recognition is not in this build.'));
      }

      try {
        // Asked only from here, which is only reached when the user taps the
        // microphone. Nothing requests the microphone on app start.
        const current = await native.getPermissionsAsync();
        if (current.granted) return ok(true);

        if (!current.canAskAgain) return err(blockedError());

        const asked = await native.requestPermissionsAsync();
        if (asked.granted) return ok(true);

        // Refused this time, but the dialog can be shown again.
        return asked.canAskAgain ? ok(false) : err(blockedError());
      } catch (cause) {
        log.warn('the permission request failed', cause);
        return err(appError('permission_denied', 'Microphone access could not be confirmed.'));
      }
    },

    async start(options: SpeechRecognitionOptions): ServiceResult<void> {
      if (!native) {
        return err(appError('not_implemented', 'Speech recognition is not in this build.'));
      }

      // A second start would leak the first session's native listeners and
      // leave two sets of events racing to fill the same input. Rather than
      // silently no-op, the stale session is torn down first: a session that
      // never reached `end` (the app backgrounded mid-listen, a screen
      // changed while the mic was still open) would otherwise wedge this
      // singleton's flag `true` forever, quietly disabling every microphone
      // in the app for the rest of the process's life.
      if (listening) {
        try {
          native.abort();
        } catch (cause) {
          log.warn('could not abort the stale session', cause);
        }
        teardown();
      }

      // `auto` is a routing instruction, not a language. The recogniser needs a
      // real locale, and guessing one would put words in the user's mouth.
      if (isAutoDetect(options.language)) {
        return err(
          appError('unsupported_language', 'Choose a language before using the microphone.'),
        );
      }

      if (!native.isRecognitionAvailable()) {
        return err(
          appError('service_unavailable', 'This device has no speech recogniser available.'),
        );
      }

      try {
        subscriptions = [
          native.addListener('result', (payload: never) => {
            const event = payload as unknown as {
              isFinal: boolean;
              results: { transcript: string }[];
            };
            const transcript = event.results[0]?.transcript ?? '';

            // An empty final result is "nothing was heard", which the end event
            // reports; forwarding it would blank whatever the user had typed.
            if (event.isFinal) {
              if (transcript) emit({ type: 'final', transcript });
            } else if (transcript) {
              emit({ type: 'partial', transcript });
            }
          }),

          native.addListener('volumechange', (payload: never) => {
            const { value } = payload as unknown as { value: number };
            emit({ type: 'volume', level: value });
          }),

          native.addListener('error', (payload: never) => {
            const { error } = payload as unknown as { error: string };
            // Only the code is read. The native payload can quote what was
            // heard, and none of it is logged or shown.
            emit({ type: 'error', error: toAppError(error) });
          }),

          native.addListener('end', () => {
            teardown();
            emit({ type: 'end' });
          }),
        ];

        listening = true;
        native.start({
          lang: options.language,
          interimResults: options.interimResults ?? true,
          continuous: false,
        });

        return ok(undefined);
      } catch (cause) {
        teardown();
        log.warn('the recogniser refused to start');
        return err(appError('service_unavailable', 'Listening could not be started.', cause));
      }
    },

    async stop(): ServiceResult<void> {
      if (!native || !listening) return ok(undefined);

      try {
        // Asks for a final result; `end` arrives afterwards and tears down.
        native.stop();
        return ok(undefined);
      } catch (cause) {
        teardown();
        log.warn('the recogniser refused to stop');
        return err(appError('unknown', 'Listening could not be stopped.', cause));
      }
    },

    async cancel(): ServiceResult<void> {
      if (!native || !listening) return ok(undefined);

      try {
        native.abort();
        teardown();
        return ok(undefined);
      } catch (cause) {
        teardown();
        log.warn('the recogniser refused to cancel');
        return err(appError('unknown', 'Listening could not be cancelled.', cause));
      }
    },

    subscribe(listener: (event: SpeechRecognitionEvent) => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/**
 * Whether this device can recognise speech without a network.
 *
 * Exposed separately because it is a claim worth being careful about: most
 * Android devices stream audio to Google to transcribe it, and the app must
 * never imply otherwise.
 */
export function supportsOnDeviceRecognition(
  native: SpeechRecognitionNative | null = ExpoSpeechRecognitionModule as SpeechRecognitionNative,
): boolean {
  try {
    return native?.supportsOnDeviceRecognition() ?? false;
  } catch {
    return false;
  }
}

export const expoSpeechRecognitionService: SpeechService = createExpoSpeechRecognitionService();
