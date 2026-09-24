import { useCallback, useRef, useState } from 'react';

import { services, type TutorReply, type TutorTurn } from '@/services';
import { usePreferences } from '@/store';
import type { AppError, LanguageId, TranslationResult } from '@/types';

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
 */

/** Which participant spoke. `near` is the phone's owner, `far` the other. */
export type Side = 'near' | 'far';

export type ConversationTurn = {
  id: string;
  side: Side;
  /** What was heard, kept even when the translation fails. */
  heard: string;
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  /** Absent while translating, and when translating failed. */
  result?: TranslationResult;
  error?: AppError;
  /**
   * The tutor's answer, when this turn was practice rather than translation.
   *
   * A practice turn is still a turn — same bubble, same transcript — so the
   * screen does not need two lists. What differs is what fills it.
   */
  tutor?: TutorReply;
};

/** Who the far side is. Practice replaces the second person with a tutor. */
export type ConversationMode = 'person' | 'tutor';

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

export function useConversation(
  source: LanguageId,
  target: LanguageId,
  mode: ConversationMode = 'person',
): ConversationController {
  const { preferences } = usePreferences();
  const [turns, setTurns] = useState<readonly ConversationTurn[]>([]);
  const [listening, setListening] = useState<Side | undefined>(undefined);

  /** Ids are local to the transcript; history assigns its own. */
  const nextId = useRef(0);

  const begin = useCallback((side: Side) => setListening(side), []);
  const cancel = useCallback(() => setListening(undefined), []);
  const clear = useCallback(() => setTurns([]), []);

  const submit = useCallback(
    (side: Side, heard: string) => {
      const text = heard.trim();
      setListening(undefined);
      if (!text) return;

      const { from, to } = directionFor(side, source, target);
      nextId.current += 1;
      const id = `turn-${nextId.current}`;

      // The turn appears the moment it is spoken, answer pending. Waiting for
      // the round trip would make the phone look like it had not heard.
      setTurns((current) => [
        ...current,
        { id, side, heard: text, sourceLanguage: from, targetLanguage: to },
      ]);

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
            setTurns((current) =>
              current.map((turn) =>
                turn.id === id
                  ? result.ok
                    ? { ...turn, tutor: result.value }
                    : { ...turn, error: result.error }
                  : turn,
              ),
            );
          });
        return;
      }

      void translateAndRecord(
        services.translation.router,
        services.history,
        { text, sourceLanguage: from, targetLanguage: to, origin: 'voice' },
        { saveHistory: preferences.saveHistory },
      ).then((result) => {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === id
              ? result.ok
                ? { ...turn, result: result.value }
                : { ...turn, error: result.error }
              : turn,
          ),
        );
      });
    },
    // `turns` is a dependency on purpose: the tutor is given the thread as
    // it stands, and a stale closure would hand it a conversation missing its
    // most recent exchanges.
    [mode, preferences.saveHistory, source, target, turns],
  );

  return { turns, listening, begin, cancel, submit, clear };
}
