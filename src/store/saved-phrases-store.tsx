import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { SAVED_PHRASES_LIMIT, savedPhraseId, services, type SavedPhrase } from '@/services';
import type { LanguageId } from '@/types';

export type { SavedPhrase };

/** What is needed to save a phrase; the id and the time are worked out here. */
export type PhraseToSave = {
  text: string;
  translation: string;
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
};

/** Adds a phrase to the front, replacing an earlier copy of the same one. */
export function addPhrase(list: readonly SavedPhrase[], phrase: SavedPhrase): SavedPhrase[] {
  return [phrase, ...list.filter((item) => item.id !== phrase.id)].slice(0, SAVED_PHRASES_LIMIT);
}

export function removePhrase(list: readonly SavedPhrase[], id: string): SavedPhrase[] {
  return list.filter((item) => item.id !== id);
}

export type SavedPhrasesStoreValue = {
  phrases: readonly SavedPhrase[];
  isSaved: (text: string, source: LanguageId, target: LanguageId) => boolean;
  /** Saves the phrase, or removes it if it is already saved. Returns whether it is saved now. */
  toggle: (phrase: PhraseToSave) => boolean;
  remove: (id: string) => void;
};

const SavedPhrasesContext = createContext<SavedPhrasesStoreValue | null>(null);

/**
 * The user's saved phrases, shared by the Phrases screen and the Save button
 * on a translation, so saving in one place shows in the other at once.
 *
 * Hydrated once from the device and mirrored back on every change, the same
 * way the conversation transcripts are.
 */
export function SavedPhrasesProvider({ children }: { children: ReactNode }) {
  const [phrases, setPhrases] = useState<readonly SavedPhrase[]>([]);
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    void services.savedPhrases.load().then((stored) => {
      if (!active || hydrated.current) return;
      hydrated.current = true;
      // Merged, so a phrase saved before the read finished is not lost.
      setPhrases((current) => current.reduce((list, phrase) => addPhrase(list, phrase), stored));
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    void services.savedPhrases.save(phrases);
  }, [phrases]);

  /** Read synchronously by `toggle`, which must answer before the next render. */
  const latest = useRef(phrases);
  useEffect(() => {
    latest.current = phrases;
  }, [phrases]);

  const isSaved = useCallback(
    (text: string, source: LanguageId, target: LanguageId) => {
      const id = savedPhraseId(text, source, target);
      return phrases.some((item) => item.id === id);
    },
    [phrases],
  );

  const toggle = useCallback((phrase: PhraseToSave) => {
    const id = savedPhraseId(phrase.text, phrase.sourceLanguage, phrase.targetLanguage);
    const wasSaved = latest.current.some((item) => item.id === id);

    setPhrases((current) =>
      wasSaved
        ? removePhrase(current, id)
        : addPhrase(current, { ...phrase, id, savedAt: Date.now() }),
    );
    return !wasSaved;
  }, []);

  const remove = useCallback((id: string) => {
    hydrated.current = true;
    setPhrases((current) => removePhrase(current, id));
  }, []);

  const value = useMemo<SavedPhrasesStoreValue>(
    () => ({ phrases, isSaved, toggle, remove }),
    [phrases, isSaved, toggle, remove],
  );

  return <SavedPhrasesContext.Provider value={value}>{children}</SavedPhrasesContext.Provider>;
}

export function useSavedPhrases(): SavedPhrasesStoreValue {
  const context = useContext(SavedPhrasesContext);
  if (!context) {
    throw new Error('useSavedPhrases must be used inside <SavedPhrasesProvider>.');
  }
  return context;
}
