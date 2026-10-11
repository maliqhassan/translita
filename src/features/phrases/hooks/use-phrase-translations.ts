import { useEffect, useMemo, useState } from 'react';

import { services } from '@/services';
import type { AppError, LanguageId } from '@/types';

import { PHRASEBOOK_LANGUAGE } from '../phrase-catalog';

export type PhraseTranslation =
  | { status: 'loading' }
  | { status: 'done'; translation: string }
  | { status: 'error'; error: AppError };

/**
 * Translations already made this session, so moving between categories, or
 * leaving and coming back, does not ask for the same phrase twice.
 */
const cache = new Map<string, string>();
const keyFor = (target: LanguageId, text: string) => `${target}|${text}`;

/**
 * The phrasebook's phrases, translated into the target language.
 *
 * One at a time rather than all at once: a category is a handful of short
 * phrases, and a burst of parallel requests would only compete with each
 * other. Each phrase shows as soon as it arrives. The translations go through
 * the same router as everything else — online, or on-device with a language
 * pack — and none of them is written to history, because looking through a
 * phrasebook is not translating something.
 *
 * English needs no request at all: the phrasebook is written in it, so each
 * phrase is its own translation. That is the case for someone using the app
 * in another language and travelling to an English-speaking country.
 */
export function usePhraseTranslations(
  phrases: readonly string[],
  target: LanguageId,
): Record<string, PhraseTranslation> {
  /** Answers that arrived while this screen was open, by target and phrase. */
  const [fetched, setFetched] = useState<Record<string, PhraseTranslation>>({});

  useEffect(() => {
    let active = true;

    void (async () => {
      for (const text of phrases) {
        if (!active) return;
        const key = keyFor(target, text);
        if (cache.has(key) || target === PHRASEBOOK_LANGUAGE) continue;

        const result = await services.translation.router.translate({
          text,
          sourceLanguage: PHRASEBOOK_LANGUAGE,
          targetLanguage: target,
          origin: 'text',
        });
        if (!active) return;

        if (result.ok) cache.set(key, result.value.translatedText);
        setFetched((current) => ({
          ...current,
          [key]: result.ok
            ? { status: 'done', translation: result.value.translatedText }
            : { status: 'error', error: result.error },
        }));
      }
    })();

    return () => {
      active = false;
    };
    // `phrases` is a stable array from the catalogue; its identity is enough.
  }, [phrases, target]);

  // Cached translations show at once; the rest show as they arrive.
  return useMemo(() => {
    const results: Record<string, PhraseTranslation> = {};
    for (const text of phrases) {
      const key = keyFor(target, text);
      const cached = target === PHRASEBOOK_LANGUAGE ? text : cache.get(key);
      results[text] = cached
        ? { status: 'done', translation: cached }
        : (fetched[key] ?? { status: 'loading' });
    }
    return results;
  }, [phrases, target, fetched]);
}
