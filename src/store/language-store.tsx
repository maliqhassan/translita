import { createContext, useContext, useMemo, useReducer, type ReactNode } from 'react';

import type { LanguageId, LanguagePair } from '@/types';

import { applySource, applySwap, applyTarget, canSwap, remember } from './language-pair-rules';
import { usePreferences } from './preferences-store';

export type LanguageField = 'source' | 'target';

type State = {
  pair: LanguagePair;
  /** Most recently chosen first. Excludes the detect sentinel. */
  recentSource: readonly LanguageId[];
  recentTarget: readonly LanguageId[];
};

type Action =
  | { type: 'setSource'; id: LanguageId }
  | { type: 'setTarget'; id: LanguageId }
  | { type: 'setPair'; pair: LanguagePair }
  | { type: 'swap' };

function reducer(state: State, action: Action): State {
  const { pair } = state;

  switch (action.type) {
    case 'setSource': {
      const next = applySource(pair, action.id);
      return {
        pair: next,
        recentSource: remember(state.recentSource, action.id),
        // A swap also moved the other side, so record what landed there.
        recentTarget:
          next.target === pair.source
            ? remember(state.recentTarget, next.target)
            : state.recentTarget,
      };
    }

    case 'setTarget': {
      const next = applyTarget(pair, action.id);
      return {
        pair: next,
        recentSource:
          next.source === pair.target
            ? remember(state.recentSource, next.source)
            : state.recentSource,
        recentTarget: remember(state.recentTarget, action.id),
      };
    }

    case 'setPair':
      return { ...state, pair: action.pair };

    case 'swap':
      return { ...state, pair: applySwap(pair) };
  }
}

type LanguageContextValue = {
  pair: LanguagePair;
  canSwap: boolean;
  recent: { source: readonly LanguageId[]; target: readonly LanguageId[] };
  setSource: (id: LanguageId) => void;
  setTarget: (id: LanguageId) => void;
  /** Writes whichever side the picker was opened for. */
  select: (field: LanguageField, id: LanguageId) => void;
  /**
   * Both sides at once, for a starting pair. Setting them one after the other
   * would persist the first change against the pair as it was before it.
   */
  setPair: (pair: LanguagePair) => void;
  swap: () => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

/**
 * Holds the source/target pair shared by the translate, camera and voice flows,
 * plus the recently chosen languages per side.
 *
 * This remains the runtime source of truth for the pair. Preferences are only
 * where it is kept between launches: the initial state is hydrated from them,
 * and every change writes back. There is no second copy of the pair.
 *
 * Recents stay in memory. They are a within-session convenience, and
 * persisting them would mean writing on every pick for very little gain.
 */
export function LanguageProvider({ children }: { children: ReactNode }) {
  const { preferences, update } = usePreferences();

  // The provider only mounts once preferences have loaded, so this initial
  // value is the persisted pair rather than a default to be corrected later.
  const [state, dispatch] = useReducer(reducer, undefined, () => ({
    pair: { source: preferences.sourceLanguage, target: preferences.targetLanguage },
    recentSource: [],
    recentTarget: [],
  }));

  const value = useMemo<LanguageContextValue>(() => {
    const persist = (pair: LanguagePair) =>
      update({ sourceLanguage: pair.source, targetLanguage: pair.target });

    /**
     * The next pair is computed with the same pure rule the reducer uses, so
     * what gets persisted is exactly what the store will hold — the swap and
     * collision rules are never restated here.
     */
    const setSource = (id: LanguageId) => {
      dispatch({ type: 'setSource', id });
      persist(applySource(state.pair, id));
    };

    const setTarget = (id: LanguageId) => {
      dispatch({ type: 'setTarget', id });
      persist(applyTarget(state.pair, id));
    };

    return {
      pair: state.pair,
      canSwap: canSwap(state.pair),
      recent: { source: state.recentSource, target: state.recentTarget },
      setSource,
      setTarget,
      select: (field, id) => (field === 'source' ? setSource(id) : setTarget(id)),
      setPair: (next) => {
        dispatch({ type: 'setPair', pair: next });
        persist(next);
      },
      swap: () => {
        dispatch({ type: 'swap' });
        persist(applySwap(state.pair));
      },
    };
  }, [state, update]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguagePair(): LanguageContextValue {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error('useLanguagePair must be used inside <LanguageProvider>.');
  }
  return context;
}
