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

import { CONVERSATION_AD_INTERVAL } from '@/constants';
import {
  EMPTY_CONVERSATION_TURNS,
  services,
  type ConversationMode,
  type ConversationSide,
  type ConversationTurn,
  type TurnsByMode,
} from '@/services';

export type { ConversationMode, ConversationSide, ConversationTurn, TurnsByMode };

/**
 * The Conversation screen's transcripts, kept above the screen that reads them.
 *
 * A navigation stack keeps the screen behind the one in front mounted rather
 * than destroying it — the same fact `use-speech-recognition.ts` had to guard
 * against for a live recognition session applies here to history: a `useState`
 * inside the screen's own hook is reset every time the screen remounts, which
 * is exactly what happens on an ordinary "go home, come back" trip through the
 * tab bar. Holding the turns here instead means they survive that trip.
 *
 * That alone would not survive closing the app, though — a remount is not a
 * cold start, and this context tree is rebuilt from nothing either way. What
 * makes a transcript outlive the process is `services.conversationHistory`:
 * this provider hydrates from it once, on mount, and mirrors every change back
 * to it. The in-memory state is what the screen renders from; the service is
 * what makes that state resume rather than start over.
 *
 * Person and Practice keep separate transcripts — a practice thread read as a
 * human conversation would be nonsense, and the reverse is just as false. Both
 * are kept, side by side, until the user clears one; switching between them
 * only changes which is on screen.
 */

const EMPTY_TURNS = EMPTY_CONVERSATION_TURNS;

/**
 * The reducers behind the store, pulled out and exported so the shape of a
 * change can be tested without rendering a provider — the same reason
 * `directionFor` and `translationCacheKey` are plain functions elsewhere.
 */

export function appendTurn(
  state: TurnsByMode,
  mode: ConversationMode,
  turn: ConversationTurn,
): TurnsByMode {
  return { ...state, [mode]: [...state[mode], turn] };
}

export function updateTurn(
  state: TurnsByMode,
  mode: ConversationMode,
  id: string,
  updater: (turn: ConversationTurn) => ConversationTurn,
): TurnsByMode {
  return {
    ...state,
    [mode]: state[mode].map((turn) => (turn.id === id ? updater(turn) : turn)),
  };
}

/** Saved turns first, then anything added since the app opened, per mode. */
export function mergeTurns(stored: TurnsByMode, added: TurnsByMode): TurnsByMode {
  return { person: [...stored.person, ...added.person], tutor: [...stored.tutor, ...added.tutor] };
}

export function clearTurns(state: TurnsByMode, mode: ConversationMode): TurnsByMode {
  return { ...state, [mode]: [] };
}

/**
 * The ad cadence, as a step function: the count to keep, and whether this
 * reply is the one that crosses the interval.
 *
 * One counter regardless of which mode answered, so a reply on either side
 * counts toward the same interval — the ad funds the feature as a whole, not
 * one side of it. Resets on the reply that fires rather than the one after,
 * so the interval is exactly `interval` replies apart, not `interval + 1`.
 */
export function nextAdCount(previous: number, interval: number): { count: number; due: boolean } {
  const count = previous + 1;
  return count >= interval ? { count: 0, due: true } : { count, due: false };
}

export type ConversationStoreValue = {
  turnsFor: (mode: ConversationMode) => readonly ConversationTurn[];
  append: (mode: ConversationMode, turn: ConversationTurn) => void;
  update: (
    mode: ConversationMode,
    id: string,
    updater: (turn: ConversationTurn) => ConversationTurn,
  ) => void;
  clear: (mode: ConversationMode) => void;
  /**
   * Records that a reply was answered, in either mode, and reports whether an
   * interstitial is due now.
   *
   * One counter across both modes: the ad pays for the conversation feature as
   * a whole, not for one side of it. A ref rather than state, because nothing
   * renders from the count itself — only the moment it crosses the interval
   * matters, and that moment is this return value.
   */
  recordReply: () => boolean;
};

const ConversationContext = createContext<ConversationStoreValue | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [turns, setTurns] = useState<TurnsByMode>(EMPTY_TURNS);
  const repliesSinceAd = useRef(0);

  /**
   * Read once, before anything is written.
   *
   * A ref rather than state: nothing should render differently before and
   * after hydration completes — the screen already renders an empty
   * transcript on a genuine first launch, and briefly showing the same thing
   * while yesterday's turns load in behind it is not a loading state worth
   * having.
   */
  const hydrated = useRef(false);

  useEffect(() => {
    let active = true;
    void services.conversationHistory.load().then((stored) => {
      // A `clear()` reachable before the read resolves must win; loading the
      // old transcript over it would resurrect what the user just cleared.
      if (!active || hydrated.current) return;
      hydrated.current = true;
      // Merged rather than replaced: a turn spoken in the moment before the
      // read resolved would otherwise be overwritten by the older transcript.
      setTurns((current) => mergeTurns(stored, current));
    });
    return () => {
      active = false;
    };
  }, []);

  /**
   * Mirrors every change to disk, fire-and-forget.
   *
   * Not awaited, the same way a history write is not: the screen already has
   * what it needs from the in-memory state the moment `setTurns` runs, and a
   * slow or failing disk write must never make the transcript feel stuck.
   * Skipped until hydration lands, so the empty state a fresh provider starts
   * in can never overwrite a transcript still being read from disk.
   */
  useEffect(() => {
    if (!hydrated.current) return;
    void services.conversationHistory.save(turns);
  }, [turns]);

  const turnsFor = useCallback((mode: ConversationMode) => turns[mode], [turns]);

  const append = useCallback((mode: ConversationMode, turn: ConversationTurn) => {
    setTurns((current) => appendTurn(current, mode, turn));
  }, []);

  const update = useCallback(
    (mode: ConversationMode, id: string, updater: (turn: ConversationTurn) => ConversationTurn) => {
      setTurns((current) => updateTurn(current, mode, id, updater));
    },
    [],
  );

  const clear = useCallback((mode: ConversationMode) => {
    hydrated.current = true;
    setTurns((current) => clearTurns(current, mode));
  }, []);

  const recordReply = useCallback((): boolean => {
    const next = nextAdCount(repliesSinceAd.current, CONVERSATION_AD_INTERVAL);
    repliesSinceAd.current = next.count;
    return next.due;
  }, []);

  const value = useMemo<ConversationStoreValue>(
    () => ({ turnsFor, append, update, clear, recordReply }),
    [turnsFor, append, update, clear, recordReply],
  );

  return <ConversationContext.Provider value={value}>{children}</ConversationContext.Provider>;
}

export function useConversationStore(): ConversationStoreValue {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error('useConversationStore must be used inside <ConversationProvider>.');
  }
  return context;
}
