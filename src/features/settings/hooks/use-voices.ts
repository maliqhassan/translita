import { useEffect, useState } from 'react';

import { services, type Voice } from '@/services';
import type { AppError, LanguageId } from '@/types';

/**
 * The voices this device can offer for one language.
 *
 * Read-only: enumerating voices never installs one, and nothing here reaches
 * the network. A device with no voice for the language reports an empty list
 * rather than an error, which is a different thing to say and is said
 * differently by the screen.
 */

export type VoicesState = {
  loading: boolean;
  voices: readonly Voice[];
  /** Set only when the list could not be read at all. */
  error?: AppError;
};

/** What arrived, and which language it was asked for. */
type Answer = {
  language: LanguageId;
  voices: readonly Voice[];
  error?: AppError;
};

export function useVoices(language: LanguageId): VoicesState {
  const [answer, setAnswer] = useState<Answer | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;

    void services.tts.getVoices(language).then((result) => {
      if (cancelled) return;

      // An unreadable list is not an empty one: the screen offers an
      // explanation for the first and a different one for the second.
      setAnswer(
        result.ok
          ? { language, voices: result.value }
          : { language, voices: [], error: result.error },
      );
    });

    return () => {
      cancelled = true;
    };
  }, [language]);

  /*
   * Derived rather than stored.
   *
   * Setting a loading flag at the top of the effect would be a synchronous
   * setState in an effect body, and it would also lie for one render after
   * the language changed — the previous language's voices would still be on
   * screen while `loading` read false. Comparing what arrived against what
   * was asked for answers both at once.
   */
  const loading = answer?.language !== language;

  return {
    loading,
    voices: loading ? [] : answer.voices,
    error: loading ? undefined : answer.error,
  };
}
