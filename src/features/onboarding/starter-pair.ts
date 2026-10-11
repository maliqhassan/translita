import { appLanguage, type AppLanguageCode } from '@/i18n';
import type { LanguagePair } from '@/types';

/** What a new user translates into unless they choose otherwise. */
const STARTER_TARGET = 'en';

/**
 * The pair Home opens on for someone who just chose the app's language.
 *
 * They speak that language, so it is what they translate from, and English is
 * what most of them will want to reach. Someone who chose English keeps the
 * default pair: English into English would translate nothing.
 */
export function starterPair(code: AppLanguageCode): LanguagePair | undefined {
  const source = appLanguage(code).languageId;
  if (source === STARTER_TARGET) return undefined;
  return { source, target: STARTER_TARGET };
}
