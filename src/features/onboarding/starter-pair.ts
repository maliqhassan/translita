import { countryLanguage } from '@/constants';
import { appLanguage, type AppLanguageCode } from '@/i18n';
import type { LanguagePair } from '@/types';

/** What a new user translates into unless they choose otherwise. */
const STARTER_TARGET = 'en';

/**
 * The pair Home opens on for someone who just chose the app's language.
 *
 * They speak that language, so it is what they translate from, and English is
 * what most of them will want to reach. Someone who chose English would
 * otherwise get English into English, which translates nothing: they start on
 * English into their country's language instead — English to Filipino in the
 * Philippines — or keep the default pair where the country says nothing.
 */
export function starterPair(code: AppLanguageCode, region?: string): LanguagePair | undefined {
  const source = appLanguage(code).languageId;
  if (source !== STARTER_TARGET) return { source, target: STARTER_TARGET };
  const local = countryLanguage(region);
  return local && local !== STARTER_TARGET ? { source: STARTER_TARGET, target: local } : undefined;
}
