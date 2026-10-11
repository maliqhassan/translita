/**
 * The languages the app's own words — menus, buttons, onboarding, messages —
 * are available in.
 *
 * Separate from the 89 languages the app translates between. Those are what a
 * user translates; these are what the app speaks to the user in. Each one here
 * has a full catalogue of the app's text, checked by a test.
 */
export type AppLanguageCode =
  'en' | 'ur' | 'hi' | 'ar' | 'bn' | 'es' | 'fr' | 'de' | 'pt' | 'id' | 'tr' | 'fil';

export type AppLanguage = {
  code: AppLanguageCode;
  /**
   * The same language in the translation catalogue: where its flag comes
   * from, and the side of the pair a new user starts on. Portuguese is the
   * Brazilian variant, which is how its catalogue is written.
   */
  languageId: string;
  /** The language's name in English. */
  name: string;
  /** The language's name in itself, which is how a speaker looks for it. */
  nativeName: string;
  /** Written right to left. The layout stays as it is; the text flows RTL. */
  rtl: boolean;
};

/**
 * In the order the first screen lists them: English, then the languages with
 * the widest reach across countries. The phone's own language is selected
 * already wherever it sits, so the order is about the list, not the default.
 */
export const APP_LANGUAGES: readonly AppLanguage[] = [
  { code: 'en', languageId: 'en', name: 'English', nativeName: 'English', rtl: false },
  { code: 'es', languageId: 'es', name: 'Spanish', nativeName: 'Español', rtl: false },
  { code: 'fr', languageId: 'fr', name: 'French', nativeName: 'Français', rtl: false },
  { code: 'de', languageId: 'de', name: 'German', nativeName: 'Deutsch', rtl: false },
  { code: 'pt', languageId: 'pt-BR', name: 'Portuguese', nativeName: 'Português', rtl: false },
  { code: 'ar', languageId: 'ar', name: 'Arabic', nativeName: 'العربية', rtl: true },
  { code: 'tr', languageId: 'tr', name: 'Turkish', nativeName: 'Türkçe', rtl: false },
  { code: 'id', languageId: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', rtl: false },
  { code: 'fil', languageId: 'fil', name: 'Filipino', nativeName: 'Filipino', rtl: false },
  { code: 'bn', languageId: 'bn', name: 'Bengali', nativeName: 'বাংলা', rtl: false },
  { code: 'hi', languageId: 'hi', name: 'Hindi', nativeName: 'हिन्दी', rtl: false },
  { code: 'ur', languageId: 'ur', name: 'Urdu', nativeName: 'اردو', rtl: true },
];

export const DEFAULT_APP_LANGUAGE: AppLanguageCode = 'en';

export function isAppLanguage(value: unknown): value is AppLanguageCode {
  return typeof value === 'string' && APP_LANGUAGES.some((language) => language.code === value);
}

export function appLanguage(code: AppLanguageCode): AppLanguage {
  return APP_LANGUAGES.find((language) => language.code === code) ?? APP_LANGUAGES[0]!;
}

/**
 * The phone's own language, when the app speaks it, so the first screen can
 * offer it pre-selected. Read through `Intl`, which Hermes provides, rather
 * than a localisation package. Anything unknown is English.
 */
export function deviceAppLanguage(): AppLanguageCode {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    const base = locale.split(/[-_]/)[0] ?? '';
    // Tagalog's code is the Filipino catalogue's.
    const code = base === 'tl' ? 'fil' : base;
    return isAppLanguage(code) ? code : DEFAULT_APP_LANGUAGE;
  } catch {
    return DEFAULT_APP_LANGUAGE;
  }
}
