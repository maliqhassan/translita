import type { LanguageId } from '@/types';

/**
 * A representative country for each language, used only to draw a flag.
 *
 * Languages are not countries, and several have no single right answer —
 * English, Spanish, Arabic and Portuguese are spoken officially across many.
 * The rule here is: the country most associated with the language's origin or
 * its largest standard, and the variant's own country where the catalogue
 * splits one (Brazilian vs European Portuguese, Simplified vs Traditional
 * Chinese). It is a visual cue next to the name, never a replacement for it —
 * the language's name always comes from the catalogue.
 *
 * Anything without an entry — including `auto` — simply shows no flag.
 */
const REGION: Readonly<Record<string, string>> = {
  en: 'GB',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  'pt-BR': 'BR',
  'pt-PT': 'PT',
  pt: 'PT',
  ru: 'RU',
  ar: 'SA',
  hi: 'IN',
  'zh-Hans': 'CN',
  'zh-Hant': 'TW',
  zh: 'CN',
  ja: 'JP',
  nl: 'NL',
  uk: 'UA',
  pl: 'PL',
  tr: 'TR',
  fa: 'IR',
  ur: 'PK',
  bn: 'BD',
  pa: 'IN',
  gu: 'IN',
  mr: 'IN',
  ta: 'IN',
  te: 'IN',
  kn: 'IN',
  ml: 'IN',
  as: 'IN',
  or: 'IN',
  ne: 'NP',
  si: 'LK',
  ko: 'KR',
  th: 'TH',
  vi: 'VN',
  id: 'ID',
  ms: 'MY',
  fil: 'PH',
  jv: 'ID',
  my: 'MM',
  km: 'KH',
  lo: 'LA',
  he: 'IL',
  el: 'GR',
  cs: 'CZ',
  sk: 'SK',
  hu: 'HU',
  ro: 'RO',
  bg: 'BG',
  hr: 'HR',
  sr: 'RS',
  bs: 'BA',
  sl: 'SI',
  mk: 'MK',
  sq: 'AL',
  be: 'BY',
  lt: 'LT',
  lv: 'LV',
  et: 'EE',
  sv: 'SE',
  nb: 'NO',
  da: 'DK',
  fi: 'FI',
  is: 'IS',
  ga: 'IE',
  cy: 'GB',
  mt: 'MT',
  ca: 'AD',
  eu: 'ES',
  gl: 'ES',
  hy: 'AM',
  ka: 'GE',
  az: 'AZ',
  kk: 'KZ',
  ky: 'KG',
  uz: 'UZ',
  tg: 'TJ',
  mn: 'MN',
  ps: 'AF',
  sd: 'PK',
  sw: 'TZ',
  am: 'ET',
  ha: 'NG',
  yo: 'NG',
  ig: 'NG',
  zu: 'ZA',
  xh: 'ZA',
  af: 'ZA',
  so: 'SO',
  mg: 'MG',
};

/**
 * The country whose flag stands for a language, as an ISO 3166 code, or
 * undefined when there is no sensible one.
 *
 * Only the code: the flag itself is a bundled image looked up by it (see
 * `flag-images.ts`). Emoji flags were tried first and could not be cropped to
 * a circle reliably — every phone maker's emoji font draws them differently.
 */
export function languageRegion(id: LanguageId): string | undefined {
  return REGION[id] ?? REGION[id.split('-')[0] ?? ''];
}
