import { useCallback, useState } from 'react';

import { services, type TutorTurn } from '@/services';
import {
  useConversationStore,
  usePreferences,
  type ConversationMode,
  type ConversationSide,
  type ConversationTurn,
} from '@/store';
import type { LanguageId } from '@/types';

import { translateAndRecord } from '../../translation/record-translation';

/**
 * A two-sided spoken conversation, as a list of finished turns.
 *
 * The screen is a transcript: each turn records who spoke, what was heard and
 * what it became. Composition only — every capability it uses already exists,
 * and this hook is the wiring rather than a second implementation of any of
 * them. Recognition comes from the caller (one recogniser, shared), the
 * translation goes through the same `translateAndRecord` the main screen uses,
 * so a conversation lands in history exactly as a typed translation does.
 *
 * The turns themselves live in `useConversationStore`, not in a `useState`
 * here — a navigation stack keeps the screen behind this one mounted rather
 * than destroying it, so state kept only in this hook would be reset by an
 * ordinary trip to another tab and back. See the store for why.
 */

/** Which participant spoke. `near` is the phone's owner, `far` the other. */
export type Side = ConversationSide;

export type { ConversationMode, ConversationTurn };

export type ConversationController = {
  turns: readonly ConversationTurn[];
  /** The side whose microphone is open, if any. */
  listening?: Side;
  /** Records that a side has started listening, so the UI can show it. */
  begin: (side: Side) => void;
  /** Called when the recogniser stops without a transcript. */
  cancel: () => void;
  /** Turns a final transcript into a turn, and answers it. */
  submit: (side: Side, heard: string) => void;
  clear: () => void;
};

/**
 * An answer worth reading aloud, and the language to read it in.
 *
 * In Person mode that is the translation, in the listener's language. In
 * Practice it is the tutor's reply and question back, in the language being
 * learned. Absent for anything that is not an answer to hear: a failure, a
 * "did you mean" list, or a polite refusal.
 */
export type SpokenAnswer = { text: string; language: LanguageId };

/**
 * `near` speaks the source language and `far` speaks the target, so a turn's
 * direction is decided entirely by which microphone was pressed.
 */
function directionFor(
  side: Side,
  source: LanguageId,
  target: LanguageId,
): { from: LanguageId; to: LanguageId } {
  return side === 'near' ? { from: source, to: target } : { from: target, to: source };
}

/** The thread the tutor is given, oldest first and already trimmed. */
function threadFrom(turns: readonly ConversationTurn[]): TutorTurn[] {
  const thread: TutorTurn[] = [];
  for (const turn of turns.slice(-8)) {
    thread.push({ role: 'learner', text: turn.heard });
    if (turn.tutor?.kind === 'reply') {
      thread.push({ role: 'tutor', text: `${turn.tutor.reply} ${turn.tutor.followUp}`.trim() });
    }
  }
  return thread;
}

/** Collision-resistant without a counter that would need to survive a remount. */
function newTurnId(): string {
  return `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useConversation(
  source: LanguageId,
  target: LanguageId,
  mode: ConversationMode = 'person',
  /**
   * Fired once a reply resolves, in either mode, with whether the ad interval
   * was reached and the answer to read aloud, if there is one. The caller
   * decides what both mean — this hook knows nothing about ads or speech, the
   * same way it does not know about entitlements.
   */
  onReply?: (dueForAd: boolean, answer?: SpokenAnswer) => void,
): ConversationController {
  const { preferences } = usePreferences();
  const store = useConversationStore();
  const turns = store.turnsFor(mode);
  const [listening, setListening] = useState<Side | undefined>(undefined);

  const begin = useCallback((side: Side) => setListening(side), []);
  const cancel = useCallback(() => setListening(undefined), []);
  const clear = useCallback(() => store.clear(mode), [store, mode]);

  const submit = useCallback(
    (side: Side, heard: string) => {
      const text = heard.trim();
      setListening(undefined);
      if (!text) return;

      const { from, to } = directionFor(side, source, target);
      const id = newTurnId();

      // The turn appears the moment it is spoken, answer pending. Waiting for
      // the round trip would make the phone look like it had not heard.
      store.append(mode, { id, side, heard: text, sourceLanguage: from, targetLanguage: to });
      services.analytics.log({
        name: 'conversation_turn',
        params: { mode: mode === 'tutor' ? 'practice' : 'person' },
      });

      /*
       * Practice answers instead of translating.
       *
       * Nothing is written to history here: a practice exchange is not a
       * translation the user asked for and keeping it would fill their
       * history with half a conversation.
       */
      if (mode === 'tutor') {
        const thread = threadFrom(turns);

        void services.tutor
          .respond({ learning: to, native: from, heard: text, history: thread })
          .then((result) => {
            store.update(mode, id, (turn) =>
              result.ok ? { ...turn, tutor: result.value } : { ...turn, error: result.error },
            );
            const answer =
              result.ok && result.value.kind === 'reply'
                ? { text: `${result.value.reply} ${result.value.followUp}`.trim(), language: to }
                : undefined;
            onReply?.(store.recordReply(), answer);
          });
        return;
      }

      void translateAndRecord(
        services.translation.router,
        services.history,
        { text, sourceLanguage: from, targetLanguage: to, origin: 'voice' },
        { saveHistory: preferences.saveHistory },
      ).then((result) => {
        store.update(mode, id, (turn) =>
          result.ok ? { ...turn, result: result.value } : { ...turn, error: result.error },
        );
        // The listener's language: `to` is the side that did not speak.
        const answer = result.ok ? { text: result.value.translatedText, language: to } : undefined;
        onReply?.(store.recordReply(), answer);
      });
    },
    // `turns` is a dependency on purpose: the tutor is given the thread as
    // it stands, and a stale closure would hand it a conversation missing its
    // most recent exchanges.
    [mode, preferences.saveHistory, source, target, turns, store, onReply],
  );

  return { turns, listening, begin, cancel, submit, clear };
}
