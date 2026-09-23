import { useCallback, useEffect, useRef, useState } from 'react';

import { services, type Voice } from '@/services';
import { usePreferences } from '@/store';
import type { AppError } from '@/types';

import { voiceSample } from '../voice-sample';

/**
 * Auditioning a voice without committing to it.
 *
 * Choosing between voices by name is guesswork, and the old flow made you
 * apply one, leave the screen and translate something before you could hear
 * it. This speaks a short sample in the voice itself.
 *
 * It reads preferences but never writes them: previewing is not choosing. The
 * saved voice, the target language and the speech rate are all untouched —
 * the rate is *used*, so a sample sounds like what the app will actually do.
 *
 * One at a time, like the translation screen: asking for a second preview
 * stops the first rather than layering two voices over each other. The engine
 * queues by default, so the stop is explicit.
 */

export type VoicePreview = {
  /** The voice currently being spoken, if any. */
  playingId?: string;
  /** Set when the last preview failed; cleared when another one starts. */
  error?: AppError;
  /** Starts this voice, or stops it if it is the one already playing. */
  toggle: (voice: Voice) => void;
  stop: () => void;
};

export function usePreviewVoice(): VoicePreview {
  const { preferences } = usePreferences();
  const [playingId, setPlayingId] = useState<string | undefined>(undefined);
  const [error, setError] = useState<AppError | undefined>(undefined);

  /** Survives unmount so a late callback cannot set state on a dead screen. */
  const mounted = useRef(true);

  /**
   * The preview this component last started.
   *
   * Read inside the promise callback to decide whether the result still
   * matters: starting a second preview makes the first one's settlement — an
   * `onStopped` caused by that very interruption — no longer this screen's
   * business, and acting on it would clear the new preview's state.
   */
  const current = useRef<string | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;

    return () => {
      mounted.current = false;
      current.current = undefined;
      // Leaving the screen must not leave a sample talking.
      void services.tts.stop();
    };
  }, []);

  const stop = useCallback(() => {
    current.current = undefined;
    setPlayingId(undefined);
    void services.tts.stop();
  }, []);

  const toggle = useCallback(
    (voice: Voice) => {
      if (current.current === voice.id) {
        stop();
        return;
      }

      // Stopping first is what keeps two samples from overlapping; the engine
      // would otherwise queue the second behind the first.
      void services.tts.stop();

      current.current = voice.id;
      setPlayingId(voice.id);
      setError(undefined);

      void services.tts
        .speak(voiceSample(voice.language), {
          // The voice's own language, not the translation target: this is a
          // sample of this voice, and it reads its own language best.
          language: voice.language,
          voiceId: voice.id,
          // The user's configured pace, so a sample sounds like the real
          // thing. Read, never written.
          rate: preferences.speechRate,
        })
        .then((result) => {
          // A preview that was superseded is no longer ours to report on.
          if (!mounted.current || current.current !== voice.id) return;

          current.current = undefined;
          setPlayingId(undefined);
          // Settles on done, stopped and failure alike, so the row can never
          // be left spinning — a failure simply also says why.
          if (!result.ok) setError(result.error);
        });
    },
    [preferences.speechRate, stop],
  );

  return { playingId, error, toggle, stop };
}
