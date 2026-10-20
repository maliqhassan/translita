import type { LanguageId } from '@/types';

import { getLanguage } from './languages';

/**
 * The country the phone is set to, from its region setting: `en-PH` is the
 * Philippines. Read through `Intl`, like the app language, so it needs no
 * location permission and nothing leaves the phone. Undefined when the
 * setting carries no country.
 */
export function deviceRegion(): string | undefined {
  try {
    return regionOf(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return undefined;
  }
}

/** The country part of a locale tag — `fil-PH` → `PH` — or undefined. */
export function regionOf(locale: string): string | undefined {
  const parts = locale.split(/[-_]/);
  // The region is the first two-letter (or three-digit) subtag after the language.
  const region = parts.slice(1).find((part) => /^([A-Za-z]{2}|\d{3})$/.test(part));
  return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : undefined;
}

/**
 * The one language most people in a country would want to translate into.
 *
 * Only where that is unambiguous: a country with two or more equally common
 * languages — Switzerland, Canada, Belgium — is left out, because no guess is
 * better than a wrong one.
 */
const COUNTRY_LANGUAGE: Readonly<Record<string, LanguageId>> = {
  PH: 'fil',
  ID: 'id',
  MY: 'ms',
  DE: 'de',
  AT: 'de',
  FR: 'fr',
  ES: 'es',
  MX: 'es',
  CO: 'es',
  AR: 'es',
  CL: 'es',
  PE: 'es',
  IT: 'it',
  BR: 'pt-BR',
  PT: 'pt-PT',
  PK: 'ur',
  BD: 'bn',
  IN: 'hi',
  SA: 'ar',
  AE: 'ar',
  EG: 'ar',
  JO: 'ar',
  KW: 'ar',
  QA: 'ar',
  OM: 'ar',
  BH: 'ar',
  TR: 'tr',
  JP: 'ja',
  KR: 'ko',
  VN: 'vi',
  TH: 'th',
  NL: 'nl',
  PL: 'pl',
  SE: 'sv',
  RU: 'ru',
  UA: 'uk',
  GR: 'el',
  CN: 'zh-Hans',
  TW: 'zh-Hant',
};

/** The country's language, if it has one and the app has it. */
export function countryLanguage(region: string | undefined): LanguageId | undefined {
  if (!region) return undefined;
  const id = COUNTRY_LANGUAGE[region.toUpperCase()];
  return id && getLanguage(id) ? id : undefined;
}

/** The country's name in the app's language — "Philippines", "Pilipinas" — or its code. */
export function countryName(region: string, language: string): string {
  try {
    return new Intl.DisplayNames([language], { type: 'region' }).of(region) ?? region;
  } catch {
    return region;
  }
}
