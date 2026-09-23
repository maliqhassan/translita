import type { LanguageCode } from '@/types';

import type { SpeakOptions } from './tts-service';

/**
 * Turning the user's speech preferences into a request the engine accepts.
 *
 * Pure and separate from the hook so the decision that actually matters —
 * whether a saved voice belongs to the language about to be spoken — can be
 * tested without React, and read without a screen around it.
 */

/**
 * A language tag split into the two parts that decide whether a voice fits.
 *
 * Region is deliberately not among them. `en-GB` and `en-US` differ in accent,
 * which is a preference; `zh-Hans` and `zh-Hant` differ in writing system,
 * which is the difference between being read and being unreadable.
 */
type LanguageTagParts = { base: string; script?: string };

/**
 * Splits a tag, tolerating both separators and any case.
 *
 * A script subtag is four letters — `Hans`, `Hant`, `Latn`, `Cyrl`. A region
 * is two letters or three digits. Matching on length is how BCP-47 itself
 * distinguishes them, and it is why `pt-BR` is read as a region while
 * `zh-Hant` is read as a script.
 */
function parseLanguageTag(tag: string): LanguageTagParts {
  const [base = '', ...rest] = tag.toLowerCase().split(/[-_]/);
  const script = rest.find((part) => /^[a-z]{4}$/.test(part));

  return script ? { base, script } : { base };
}

/**
 * The language part of a tag, ignoring script, region and separator.
 *
 * `en-GB`, `en_GB` and `en` all reduce to `en`. Platforms report voices with
 * either separator and usually with a region, while the app's LanguageIds
 * mostly have neither, so comparing the full tags would call a British voice
 * a mismatch for English.
 */
export function baseLanguageTag(tag: string): string {
  return parseLanguageTag(tag).base;
}

/**
 * Whether a voice chosen for one language may be used for another.
 *
 * The base language must match, and — only when both tags actually say which
 * script they are written in — the scripts must match too.
 *
 * That second condition is conditional on purpose. The catalogue distinguishes
 * `zh-Hans` from `zh-Hant`, so a voice saved for Simplified Chinese must never
 * be handed Traditional text. But platforms overwhelmingly report voices by
 * region rather than script — Android offers `zh-CN`, not `zh-Hans` — and
 * requiring a script that most tags simply do not carry would reject every one
 * of them. Silence is a worse outcome than a regional accent, so a tag with no
 * script stated is treated as compatible with either.
 *
 * Region is never compared: `en-GB` still matches `en-US`, and `pt-BR` still
 * matches `pt-PT`. Those are accents of one written language, and refusing
 * them would leave most users with no usable voice at all.
 */
export function voiceMatchesLanguage(voiceLanguage: string, target: string): boolean {
  const voice = parseLanguageTag(voiceLanguage);
  const wanted = parseLanguageTag(target);

  if (voice.base !== wanted.base) return false;
  if (voice.script && wanted.script) return voice.script === wanted.script;

  return true;
}

export type SpeechPreferences = {
  speechRate: number;
  voiceId?: string;
  voiceLanguage?: string;
};

/**
 * The options for reading `targetLanguage` aloud.
 *
 * The voice is included only when it was chosen for this language. A saved
 * selection is never discarded for failing to apply — the user may translate
 * into that language again in a moment — it is simply left out of this
 * utterance, and the platform picks its own voice as it always did.
 */
export function speakOptionsFor(
  targetLanguage: LanguageCode,
  preferences: SpeechPreferences,
): SpeakOptions {
  const { speechRate, voiceId, voiceLanguage } = preferences;

  const usable =
    voiceId !== undefined &&
    voiceLanguage !== undefined &&
    voiceMatchesLanguage(voiceLanguage, targetLanguage);

  return {
    language: targetLanguage,
    rate: speechRate,
    // Omitted rather than set to undefined, so the engine is handed exactly
    // what it would have received before voices could be chosen at all.
    ...(usable ? { voiceId } : {}),
  };
}
