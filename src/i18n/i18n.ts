import { CATALOGS, type Catalog } from './catalogs';
import { appLanguage, DEFAULT_APP_LANGUAGE, type AppLanguageCode } from './languages';

/**
 * The app's words, in the language the user chose.
 *
 * Keys are the English text itself, as written in the code. That keeps every
 * screen readable — `t('Translate')` says what it shows — and makes English
 * need no catalogue at all: a key with no translation simply shows as written.
 *
 * The current language is held here rather than read from a hook, so plain
 * helpers that build text (error messages, language names) can translate too.
 * The root sets it before anything renders and remounts the app when it
 * changes, so every screen redraws in the new language.
 */

let current: AppLanguageCode = DEFAULT_APP_LANGUAGE;
let catalog: Catalog | undefined;

export function setAppLanguage(code: AppLanguageCode): void {
  current = code;
  catalog = code === 'en' ? undefined : CATALOGS[code];
}

/**
 * Marks English text for translation without translating it.
 *
 * For tables built once when a module loads — labels, tips, tab titles —
 * which are translated with `t()` where they are shown, once the language is
 * known. The mark is what lets the catalogue test find them.
 */
export function msg<Text extends string>(text: Text): Text {
  return text;
}

export function currentAppLanguage(): AppLanguageCode {
  return current;
}

/** Whether the current language is written right to left. */
export function isRtl(): boolean {
  return appLanguage(current).rtl;
}

export type TranslateParams = Readonly<Record<string, string | number>>;

/**
 * Translates `text`, then fills any `{name}` placeholders from `params`.
 *
 * Placeholders are filled after translating, so each language can put them
 * wherever its grammar needs them.
 */
export function t(text: string, params?: TranslateParams): string {
  const translated = catalog?.[text] ?? text;
  if (!params) return translated;
  return translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}
