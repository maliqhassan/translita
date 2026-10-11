import { useCallback, useMemo, useState } from 'react';

import {
  POPULAR_LANGUAGES,
  SOURCE_LANGUAGES,
  TARGET_LANGUAGES,
  getLanguage,
  searchLanguages,
} from '@/constants';
import { t } from '@/i18n';
import { useLanguagePair, type LanguageField } from '@/store';
import type { Language, LanguageId } from '@/types';

/** One entry in the flattened list the picker renders. */
export type PickerRow =
  | { kind: 'section'; key: string; title: string }
  | { kind: 'chips'; key: string; languages: readonly Language[] }
  | { kind: 'language'; key: string; language: Language };

export type LanguagePickerController = {
  field: LanguageField;
  query: string;
  setQuery: (text: string) => void;
  clearQuery: () => void;
  isSearching: boolean;
  /** The language currently set for the side being picked. */
  selectedId: LanguageId;
  /** The language on the other side; choosing it swaps the pair. */
  otherSideId: LanguageId;
  rows: readonly PickerRow[];
  resultCount: number;
  select: (id: LanguageId) => void;
};

function toLanguageRows(languages: readonly Language[]): PickerRow[] {
  return languages.map((language) => ({
    kind: 'language',
    key: language.id,
    language,
  }));
}

/**
 * All of the picker's list-building and filtering, kept out of the screen.
 *
 * The result is a single flat array so one FlatList can virtualise headers,
 * shortlists and the full catalogue together.
 */
export function useLanguagePicker(
  field: LanguageField,
  onDone: () => void,
): LanguagePickerController {
  const { pair, recent, select: selectInStore } = useLanguagePair();
  const [query, setQuery] = useState('');

  const isSource = field === 'source';
  const selectedId = isSource ? pair.source : pair.target;
  const otherSideId = isSource ? pair.target : pair.source;

  const pool = isSource ? SOURCE_LANGUAGES : TARGET_LANGUAGES;
  const recentIds = isSource ? recent.source : recent.target;

  const matches = useMemo(() => searchLanguages(pool, query), [pool, query]);
  const isSearching = query.trim().length > 0;

  const recentLanguages = useMemo(
    () =>
      recentIds
        .map((id) => getLanguage(id))
        .filter((language): language is Language => language !== undefined),
    [recentIds],
  );

  const rows = useMemo<readonly PickerRow[]>(() => {
    if (isSearching) {
      return matches.length === 0 ? [] : toLanguageRows(matches);
    }

    const shortlists: PickerRow[] = [];

    if (recentLanguages.length > 0) {
      shortlists.push({ kind: 'section', key: 'section-recent', title: t('Recent') });
      shortlists.push({ kind: 'chips', key: 'chips-recent', languages: recentLanguages });
    }

    shortlists.push({ kind: 'section', key: 'section-popular', title: t('Popular') });
    shortlists.push({ kind: 'chips', key: 'chips-popular', languages: POPULAR_LANGUAGES });
    shortlists.push({ kind: 'section', key: 'section-all', title: t('All languages') });

    return [...shortlists, ...toLanguageRows(pool)];
  }, [isSearching, matches, pool, recentLanguages]);

  const select = useCallback(
    (id: LanguageId) => {
      selectInStore(field, id);
      onDone();
    },
    [field, onDone, selectInStore],
  );

  return {
    field,
    query,
    setQuery,
    clearQuery: useCallback(() => setQuery(''), []),
    isSearching,
    selectedId,
    otherSideId,
    rows,
    resultCount: isSearching ? matches.length : pool.length,
    select,
  };
}
