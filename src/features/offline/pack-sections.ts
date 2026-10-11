import { isAutoDetect } from '@/constants';
import { t } from '@/i18n';
import type { LanguagePack } from '@/services';
import type { LanguageId } from '@/types';

export type PackSection = {
  key: 'recent' | 'all' | 'results';
  title: string;
  data: readonly LanguagePack[];
};

/** Enough to be a shortlist; more and it stops being one. */
export const RECENT_PACKS_LIMIT = 5;

/**
 * Splits the packs into "Recently used" and "All languages".
 *
 * Recent is the order given — the pair in use first, then what was chosen
 * lately — keeping only languages the runtime can actually serve, so the
 * shortlist never names a language with no pack. Detect-language is not a
 * language and is skipped.
 *
 * "All languages" keeps every pack not already listed above, in the order the
 * packs arrive (alphabetical). An empty section is left out rather than shown
 * as a heading over nothing.
 */
export function packSections(
  packs: readonly LanguagePack[],
  recentIds: readonly LanguageId[],
  limit: number = RECENT_PACKS_LIMIT,
): PackSection[] {
  const byLanguage = new Map(packs.map((pack) => [pack.language, pack]));
  const recent: LanguagePack[] = [];

  for (const id of recentIds) {
    if (recent.length >= limit) break;
    if (isAutoDetect(id)) continue;
    const pack = byLanguage.get(id);
    if (pack && !recent.includes(pack)) recent.push(pack);
  }

  const rest = packs.filter((pack) => !recent.includes(pack));

  return [
    { key: 'recent' as const, title: t('Recently used'), data: recent },
    { key: 'all' as const, title: t('All languages'), data: rest },
  ].filter((section) => section.data.length > 0);
}

/**
 * The packs whose language matches a search, as one "Results" section.
 *
 * Matches the English name, the language's own name and its code, ignoring
 * case — so "deutsch", "german" and "de" all find German. An empty query
 * matches nothing here: the caller shows the ordinary sections instead.
 */
export function searchPackSections(packs: readonly LanguagePack[], query: string): PackSection[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];

  const matches = packs.filter((pack) =>
    [pack.name, pack.nativeName, pack.language].some((text) =>
      text.toLocaleLowerCase().includes(needle),
    ),
  );

  return matches.length > 0 ? [{ key: 'results', title: t('Results'), data: matches }] : [];
}
