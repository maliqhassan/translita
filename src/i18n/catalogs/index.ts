import type { AppLanguageCode } from '../languages';

import { ar } from './ar';
import { bn } from './bn';
import type { Catalog } from './catalog';
import { de } from './de';
import { es } from './es';
import { fil } from './fil';
import { fr } from './fr';
import { hi } from './hi';
import { id } from './id';
import { pt } from './pt';
import { tr } from './tr';
import { ur } from './ur';

export type { Catalog };

/** Every language but English, which is the keys themselves. */
export const CATALOGS: Readonly<Record<Exclude<AppLanguageCode, 'en'>, Catalog>> = {
  ur,
  hi,
  ar,
  bn,
  es,
  fr,
  de,
  pt,
  id,
  tr,
  fil,
};
