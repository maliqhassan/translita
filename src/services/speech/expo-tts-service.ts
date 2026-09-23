import * as Speech from 'expo-speech';

import type { LanguageCode, Unsubscribe } from '@/types';
import { appError, createLogger, err, ok } from '@/utils';

import type { ServiceResult } from '../types';

import { voiceMatchesLanguage } from './speak-options';
import type { SpeakOptions, TTSEvent, TTSService, Voice } from './tts-service';

const log = createLogger('tts');

/**
 * Reading text aloud, over the platform's own speech engine.
 *
 * The only file in the app that imports expo-speech. Everything above it sees
 * `TTSService`, so the engine could be replaced without a screen changing.
 *
 * **This is not on-device the way translation is.** Android hands the text to
 * whichever TTS engine the user has installed, and some of those fetch
 * high-quality voices over the network. Speaking is therefore never described
 * anywhere in the app as an offline capability, and it is a separate action
 * from translating — offline mode's guarantee covers the translation, which
 * has already finished by the time this can be called.
 *
 * The text passed here is the user's translation, so it is never logged.
 */

/**
 * `speak` is fire-and-forget in the native API; the interesting outcomes come
 * back as callbacks. This wraps it so callers get a `Result` that settles when
 * the utterance actually ends, which is what a speaking indicator needs.
 */
export function createExpoTTSService(speech: typeof Speech = Speech): TTSService {
  const listeners = new Set<(event: TTSEvent) => void>();

  const emit = (event: TTSEvent) => {
    for (const listener of listeners) listener(event);
  };

  return {
    id: 'tts.expo',

    async isAvailable() {
      // The module is bundled with the app, so the question is whether the
      // platform can actually enumerate an engine. A device with no TTS engine
      // installed reports no voices, and pretending otherwise would light up a
      // button that does nothing.
      try {
        const voices = await speech.getAvailableVoicesAsync();
        return voices.length > 0;
      } catch (cause) {
        log.warn('could not enumerate voices', cause);
        return false;
      }
    },

    speak(text: string, options: SpeakOptions): ServiceResult<void> {
      const trimmed = text.trim();
      if (!trimmed) {
        return Promise.resolve(err(appError('invalid_request', 'There is nothing to read aloud.')));
      }

      // The platform rejects anything longer, so this is checked rather than
      // discovered. `maxSpeechInputLength` is Number.MAX_VALUE on iOS.
      if (trimmed.length > speech.maxSpeechInputLength) {
        return Promise.resolve(
          err(appError('invalid_request', 'That is too long to read aloud in one go.')),
        );
      }

      // `auto` is a routing instruction, not a language. Handing it to a
      // speech engine would either fail or silently pick the wrong voice.
      if (options.language === 'auto') {
        return Promise.resolve(
          err(
            appError('unsupported_language', 'A specific language is needed to read text aloud.'),
          ),
        );
      }

      return new Promise((resolve) => {
        let settled = false;
        const settleOnce = (value: Awaited<ServiceResult<void>>) => {
          if (settled) return;
          settled = true;
          resolve(value);
        };

        try {
          speech.speak(trimmed, {
            // Our LanguageIds are already BCP-47 tags, which is what the
            // platform expects, so nothing is remapped or guessed here.
            language: options.language,
            voice: options.voiceId,
            rate: options.rate,
            pitch: options.pitch,
            onStart: () => emit({ type: 'start' }),
            onDone: () => {
              emit({ type: 'done' });
              settleOnce(ok(undefined));
            },
            onStopped: () => {
              // Stopping is something the user asked for, not a failure.
              emit({ type: 'stopped' });
              settleOnce(ok(undefined));
            },
            onError: (cause: Error) => {
              // Never the message: a speech error can echo the text.
              log.warn('speaking failed');
              emit({ type: 'stopped' });
              settleOnce(err(appError('unknown', 'That could not be read aloud.', cause)));
            },
          });
        } catch (cause) {
          log.warn('the speech engine refused the request');
          settleOnce(err(appError('unknown', 'That could not be read aloud.', cause)));
        }
      });
    },

    async stop(): ServiceResult<void> {
      try {
        await speech.stop();
        return ok(undefined);
      } catch (cause) {
        log.warn('could not stop speaking');
        return err(appError('unknown', 'Speech could not be stopped.', cause));
      }
    },

    async getVoices(language?: LanguageCode): ServiceResult<Voice[]> {
      try {
        const voices = await speech.getAvailableVoicesAsync();

        const mapped = voices.map<Voice>((voice) => ({
          id: voice.identifier,
          name: voice.name,
          language: voice.language,
        }));

        if (!language) return ok(mapped);

        // Match on the base subtag so `en` finds `en-GB`, without claiming a
        // regional voice is the one that was asked for. The same rule decides
        // whether a saved voice may be applied, so it lives in one place.
        return ok(mapped.filter((voice) => voiceMatchesLanguage(voice.language, language)));
      } catch (cause) {
        log.warn('could not list voices');
        return err(
          appError('service_unavailable', 'The available voices could not be read.', cause),
        );
      }
    },

    subscribe(listener: (event: TTSEvent) => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const expoTTSService: TTSService = createExpoTTSService();
