import { useCallback, useEffect, useRef, useState } from 'react';

import { FEATURES } from '@/constants';
import { services, speakOptionsFor } from '@/services';
import { usePreferences } from '@/store';
import type { LanguageCode } from '@/types';

/**
 * Reading a translation aloud, as a screen needs it.
 *
 * One utterance at a time: tapping while speaking stops it rather than
 * queueing a second, which is what the control looks like it does. The
 * platform queues by default, so this is stopped explicitly first.
 *
 * The text is the user's translation and is never logged here or below.
 */

export type SpeakController = {
  /** True while an utterance is in progress, so the button can offer a stop. */
  speaking: boolean;
  /** False when the device has no speech engine; the control is then hidden. */
  available: boolean;
  /** Speaks the text, or stops if this is already speaking. */
  toggle: (text: string, language: LanguageCode) => void;
  stop: () => void;
};

export function useSpeak(): SpeakController {
  // Read here rather than threaded through the screen: the rate and voice are
  // the user's standing choice, not something a caller decides per utterance.
  const { preferences } = usePreferences();
  const [speaking, setSpeaking] = useState(false);
  const [available, setAvailable] = useState(false);

  /** Survives unmount so a late callback cannot set state on a dead screen. */
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;

    // Two gates, both real: the flag says the capability has shipped, and the
    // engine says this particular device can actually speak.
    if (!FEATURES.textToSpeech) return;

    void services.tts.isAvailable().then((can) => {
      if (mounted.current) setAvailable(can);
    });

    return () => {
      mounted.current = false;
      // Leaving the screen should not leave a voice talking.
      void services.tts.stop();
    };
  }, []);

  const stop = useCallback(() => {
    void services.tts.stop();
    setSpeaking(false);
  }, []);

  const toggle = useCallback(
    (text: string, language: LanguageCode) => {
      if (speaking) {
        stop();
        return;
      }

      setSpeaking(true);
      void services.tts.speak(text, speakOptionsFor(language, preferences)).then(() => {
        // The promise settles on done, stopped and error alike, which is
        // exactly when the button should stop offering to stop.
        if (mounted.current) setSpeaking(false);
      });
    },
    [preferences, speaking, stop],
  );

  return { speaking, available, toggle, stop };
}
