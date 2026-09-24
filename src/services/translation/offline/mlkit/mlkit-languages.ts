import type { LanguageId } from '@/types';

/**
 * Mapping between Translita LanguageIds and ML Kit translation languages.
 *
 * ML Kit exposes **59** languages as `TranslateLanguage` constants. Our
 * catalogue has 89. This module is the explicit, auditable join between them:
 * every catalogue language is either mapped to a real ML Kit code or recorded
 * here as unsupported with the reason. Nothing is inferred at runtime, and
 * nothing claims support it cannot deliver.
 *
 * Source: the `TranslateLanguage` constants in the ML Kit Android SDK.
 */

/**
 * Every code ML Kit accepts, verbatim.
 *
 * Kept as data so the mapping can be checked against it rather than trusted.
 */
export const MLKIT_LANGUAGE_CODES: readonly string[] = [
  'af',
  'sq',
  'ar',
  'be',
  'bg',
  'bn',
  'ca',
  'zh',
  'hr',
  'cs',
  'da',
  'nl',
  'en',
  'eo',
  'et',
  'fi',
  'fr',
  'gl',
  'ka',
  'de',
  'el',
  'gu',
  'ht',
  'he',
  'hi',
  'hu',
  'is',
  'id',
  'ga',
  'it',
  'ja',
  'kn',
  'ko',
  'lt',
  'lv',
  'mk',
  'mr',
  'ms',
  'mt',
  'no',
  'fa',
  'pl',
  'pt',
  'ro',
  'ru',
  'sk',
  'sl',
  'es',
  'sv',
  'sw',
  'tl',
  'ta',
  'te',
  'th',
  'tr',
  'uk',
  'ur',
  'vi',
  'cy',
];

/**
 * Catalogue ids whose ML Kit code differs from the id.
 *
 * An alias is only allowed where the pairing is unambiguous: our catalogue has
 * exactly one entry for that language, and ML Kit has exactly one code for it,
 * so there is no question about which variant we would be promising.
 */
const ALIASES: Readonly<Record<LanguageId, { code: string; reason: string }>> = {
  nb: {
    code: 'no',
    reason: 'ML Kit exposes Norwegian as "no"; Bokmal is our only Norwegian entry.',
  },
  fil: {
    code: 'tl',
    reason: 'ML Kit exposes Filipino as Tagalog "tl"; it is our only Filipino entry.',
  },
};

/**
 * Catalogue ids ML Kit cannot serve, and why.
 *
 * The script and region variants are the interesting cases. ML Kit has a
 * single `zh` and a single `pt`, while our catalogue deliberately splits both.
 * Mapping `zh-Hant` onto `zh` would risk returning Simplified characters for a
 * user who asked for Traditional — the wrong script, not merely a different
 * dialect — and there is no way to know which variant the single model
 * produces without running it. Rather than promise a variant we cannot
 * guarantee, all four are excluded until a real device confirms the output.
 */
export const MLKIT_UNSUPPORTED_REASONS: Readonly<Record<LanguageId, string>> = {
  'zh-Hans': 'ML Kit has one unqualified "zh"; which script it produces is unverified.',
  'zh-Hant': 'ML Kit has one unqualified "zh"; which script it produces is unverified.',
  'pt-BR': 'ML Kit has one unqualified "pt"; which variant it produces is unverified.',
  'pt-PT': 'ML Kit has one unqualified "pt"; which variant it produces is unverified.',
};

const CODES = new Set(MLKIT_LANGUAGE_CODES);

/**
 * The ML Kit code for a LanguageId, or undefined when it cannot be served.
 *
 * A catalogue id maps only when it is itself an ML Kit code, or has an
 * explicit alias above. Everything else is unsupported, including every
 * variant ML Kit cannot express.
 */
export function toMlKitCode(id: LanguageId): string | undefined {
  if (id in MLKIT_UNSUPPORTED_REASONS) return undefined;

  const alias = ALIASES[id];
  if (alias) return alias.code;

  return CODES.has(id) ? id : undefined;
}

/** Why a language cannot run offline, for the packs screen and diagnostics. */
export function unsupportedReason(id: LanguageId): string | undefined {
  if (toMlKitCode(id) !== undefined) return undefined;
  return (
    MLKIT_UNSUPPORTED_REASONS[id] ?? 'This language is not available for on-device translation.'
  );
}

export function isMlKitSupported(id: LanguageId): boolean {
  return toMlKitCode(id) !== undefined;
}

/**
 * Every catalogue id ML Kit can serve.
 *
 * Takes the catalogue as an argument rather than importing it, so the mapping
 * stays a pure function of the two lists and can be checked against either.
 */
export function mlKitSupportedIds(catalogue: readonly { id: LanguageId }[]): LanguageId[] {
  return catalogue.map((entry) => entry.id).filter(isMlKitSupported);
}
