import { t } from '@/i18n';
import type { Language, LanguageId } from '@/types';
import { foldForSearch } from '@/utils';

import { AUTO_DETECT, AUTO_DETECT_ID, LANGUAGE_CATALOG } from './language-catalog';

export { AUTO_DETECT, AUTO_DETECT_ID, LANGUAGE_CATALOG } from './language-catalog';

/**
 * Selectors over the catalogue. Every component reads languages through this
 * module, so display names, codes and offline metadata have exactly one source.
 */

/** All real languages. `auto` is not one of them. */
export const LANGUAGES: readonly Language[] = LANGUAGE_CATALOG;

/** Valid as a translation source, including the detect sentinel. */
export const SOURCE_LANGUAGES: readonly Language[] = [AUTO_DETECT, ...LANGUAGE_CATALOG];

/** Valid as a translation target. Detection is meaningless here. */
export const TARGET_LANGUAGES: readonly Language[] = LANGUAGE_CATALOG;

/** The shortlist offered above the full list. */
export const POPULAR_LANGUAGES: readonly Language[] = LANGUAGE_CATALOG.filter(
  (language) => language.isPopular,
);

const BY_ID = new Map<LanguageId, Language>([
  [AUTO_DETECT_ID, AUTO_DETECT],
  ...LANGUAGE_CATALOG.map((language): [LanguageId, Language] => [language.id, language]),
]);

export function getLanguage(id: LanguageId): Language | undefined {
  return BY_ID.get(id);
}

/** Display name, falling back to the raw id so the UI never renders blank. */
export function languageName(id: LanguageId): string {
  // In the app's own language: "German" reads "جرمن" to an Urdu speaker.
  const name = BY_ID.get(id)?.name;
  return name ? t(name) : id;
}

/** Short badge text, e.g. `EN`, `ZH-HANS`. */
export function languageShortCode(id: LanguageId): string {
  return id.toUpperCase();
}

export function isAutoDetect(id: LanguageId): boolean {
  return id === AUTO_DETECT_ID;
}

/**
 * Precomputed haystacks so filtering never re-folds the catalogue. Built once
 * at module load; the catalogue is static.
 */
const SEARCH_INDEX = new Map<LanguageId, string>(
  SOURCE_LANGUAGES.map((language): [LanguageId, string] => [
    language.id,
    foldForSearch(`${language.name} ${language.nativeName} ${language.code} ${language.id}`),
  ]),
);

/**
 * Filters a pool by name, native name, ISO code or id. Accent-insensitive, so
 * "espanol" finds "Español". An empty query returns the pool untouched.
 */
export function searchLanguages(pool: readonly Language[], query: string): readonly Language[] {
  const needle = foldForSearch(query);
  if (!needle) return pool;
  return pool.filter((language) => SEARCH_INDEX.get(language.id)?.includes(needle) ?? false);
}
