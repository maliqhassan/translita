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
  /** True while anything is being read aloud. */
  speaking: boolean;
  /**
   * Whether this particular text is the one being read aloud.
   *
   * A screen with many speaker buttons — a list of phrases, a conversation —
   * asks this rather than `speaking`, so only the button that was pressed
   * turns into a stop button, not every button on the screen.
   */
  isSpeaking: (text: string) => boolean;
  /** False when the device has no speech engine; the control is then hidden. */
  available: boolean;
  /**
   * Speaks the text, or stops it if this same text is already being read.
   * A different text interrupts whatever is playing and starts instead.
   */
  toggle: (text: string, language: LanguageCode) => void;
  /**
   * Speaks the text whatever is playing now — stopping it first rather than
   * stopping instead — and resolves once the voice has finished, been
   * stopped or failed. For reading something aloud on its own, where a
   * toggle's "tap again to stop" would be the wrong meaning.
   */
  say: (text: string, language: LanguageCode) => Promise<void>;
  stop: () => void;
};

export function useSpeak(): SpeakController {
  // Read here rather than threaded through the screen: the rate and voice are
  // the user's standing choice, not something a caller decides per utterance.
  const { preferences } = usePreferences();
  /** The text being read aloud right now, if any. */
  const [current, setCurrent] = useState<string | undefined>(undefined);
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
    setCurrent(undefined);
  }, []);

  const say = useCallback(
    async (text: string, language: LanguageCode) => {
      await services.tts.stop();
      if (!mounted.current) return;
      setCurrent(text);
      await services.tts.speak(text, speakOptionsFor(language, preferences));
      // The promise settles on done, stopped and error alike. Cleared only if
      // this text is still the current one: when another text interrupted it,
      // stopping this one must not switch the new one's button back.
      if (mounted.current) setCurrent((now) => (now === text ? undefined : now));
    },
    [preferences],
  );

  const toggle = useCallback(
    (text: string, language: LanguageCode) => {
      if (current === text) {
        stop();
        return;
      }
      void say(text, language);
    },
    [current, say, stop],
  );

  const isSpeaking = useCallback((text: string) => current === text, [current]);

  return { speaking: current !== undefined, isSpeaking, available, toggle, say, stop };
}
