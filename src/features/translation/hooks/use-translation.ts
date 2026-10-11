import { useCallback, useRef, useState } from 'react';

import { services } from '@/services';
import { useLanguagePair, usePreferences } from '@/store';
import type { AsyncState, LanguageCode, TranslationResult, TranslationSource } from '@/types';

import { translateAndRecord } from '../record-translation';

export type TranslationController = {
  input: string;
  /**
   * Replaces the draft, recording how the text arrived.
   *
   * The origin is carried into the request and stored on the history row,
   * where the list renders a different icon for typed, spoken, scanned and
   * pasted text. Typing defaults it, so `onChangeText` can be passed straight
   * through.
   */
  setInput: (text: string, origin?: TranslationSource) => void;
  clearInput: () => void;
  state: AsyncState<TranslationResult>;
  /** True when there is something worth sending to an engine. */
  canTranslate: boolean;
  translate: () => void;
  /** Drops the current result without clearing what the user typed. */
  reset: () => void;
};

/** A result is only meaningful for the pair it was requested with. */
type Snapshot = {
  source: LanguageCode;
  target: LanguageCode;
  value: AsyncState<TranslationResult>;
};

const IDLE: AsyncState<TranslationResult> = { status: 'idle' };

/**
 * Owns the translate screen's async lifecycle: the draft text, the in-flight
 * request and the result. The screen renders this state and nothing else, and
 * the engine is reached only through `services.translation.router`.
 */
export function useTranslation(): TranslationController {
  const { pair } = useLanguagePair();
  const { preferences } = usePreferences();
  const [input, setInputState] = useState('');
  /**
   * How the current draft was produced.
   *
   * Reset to `text` whenever the user types, because that is literally what
   * happened: claiming a translation was dictated when it was hand-corrected
   * would overstate what we know. Under-claiming is the safer direction.
   */
  const [origin, setOrigin] = useState<TranslationSource>('text');
  const [snapshot, setSnapshot] = useState<Snapshot>({
    source: pair.source,
    target: pair.target,
    value: IDLE,
  });

  /** Bumped whenever a pending response stops being relevant. */
  const requestId = useRef(0);

  // Derived rather than synced: switching languages makes an existing result
  // stale, and it becomes relevant again if the user switches back.
  const state =
    snapshot.source === pair.source && snapshot.target === pair.target ? snapshot.value : IDLE;

  const settle = useCallback(
    (value: AsyncState<TranslationResult>, source: LanguageCode, target: LanguageCode) => {
      setSnapshot({ source, target, value });
    },
    [],
  );

  const setInput = useCallback(
    (text: string, from: TranslationSource = 'text') => {
      setInputState(text);
      setOrigin(from);
      // Editing supersedes whatever was showing or in flight.
      requestId.current += 1;
      settle(IDLE, pair.source, pair.target);
    },
    [pair.source, pair.target, settle],
  );

  const translate = useCallback(() => {
    const text = input.trim();
    if (!text) return;

    requestId.current += 1;
    const id = requestId.current;
    const { source, target } = pair;

    settle({ status: 'loading' }, source, target);

    // Recording happens inside `translateAndRecord` regardless of staleness:
    // the user did perform this translation, so it belongs in history even if
    // they have since typed something else.
    void translateAndRecord(
      services.translation.router,
      services.history,
      {
        text,
        sourceLanguage: source,
        targetLanguage: target,
        origin,
      },
      { saveHistory: preferences.saveHistory },
    ).then((result) => {
      if (result.ok) {
        services.analytics.log({
          name: 'translation',
          params: { method: origin, source_language: source, target_language: target },
        });
      }
      if (id !== requestId.current) return;

      settle(
        result.ok
          ? { status: 'success', data: result.value }
          : { status: 'error', error: result.error },
        source,
        target,
      );
    });
  }, [input, origin, pair, preferences.saveHistory, settle]);

  const reset = useCallback(() => {
    requestId.current += 1;
    settle(IDLE, pair.source, pair.target);
  }, [pair.source, pair.target, settle]);

  const clearInput = useCallback(() => {
    setInputState('');
    setOrigin('text');
    requestId.current += 1;
    settle(IDLE, pair.source, pair.target);
  }, [pair.source, pair.target, settle]);

  return {
    input,
    setInput,
    clearInput,
    state,
    canTranslate: input.trim().length > 0,
    translate,
    reset,
  };
}
