import type { AppError, LanguageId, TranslationResult } from '@/types';

import type { TutorReply } from '../tutor';

/**
 * A conversation turn, as both the running UI state and the stored record.
 *
 * Lives here rather than in the store or the feature, because the persistence
 * service needs the same shape the store does, and a service may not depend on
 * the store above it — see the dependency rule in `docs/ARCHITECTURE.md`.
 */

export type ConversationSide = 'near' | 'far';
export type ConversationMode = 'person' | 'tutor';

export type ConversationTurn = {
  id: string;
  side: ConversationSide;
  /** What was heard, kept even when the translation fails. */
  heard: string;
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  /** Absent while translating, and when translating failed. */
  result?: TranslationResult;
  error?: AppError;
  /** The tutor's answer, when this turn was practice rather than translation. */
  tutor?: TutorReply;
};

export type TurnsByMode = Record<ConversationMode, readonly ConversationTurn[]>;

export const EMPTY_CONVERSATION_TURNS: TurnsByMode = { person: [], tutor: [] };
