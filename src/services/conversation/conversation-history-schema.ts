import { getLanguage } from '@/constants';
import type { LanguageId } from '@/types';

import {
  EMPTY_CONVERSATION_TURNS,
  type ConversationMode,
  type ConversationSide,
  type ConversationTurn,
  type TurnsByMode,
} from './conversation-types';

/**
 * The stored shape of a conversation's transcripts, and the rules for reading
 * it back safely.
 *
 * Treated as untrusted input for the same reason preferences are: a file can
 * be truncated, written by another build, or edited by hand. Anything that
 * does not look like a turn is dropped rather than shown, one turn at a time —
 * a single bad entry costs that entry, never the whole transcript.
 *
 * `result`, `error` and `tutor` are not re-validated field by field here: each
 * was already produced, once, by the code that owns its shape — the
 * translation router, the http layer, the tutor service — and re-checking
 * their internals would duplicate validation that already happened before
 * anything was written. What is checked is only that a record is still a
 * record, which is what stops a turn from rendering `[object Object]` or
 * throwing if the file was hand-edited into nonsense.
 */

export const CONVERSATION_HISTORY_VERSION = 1;

const SIDES: readonly ConversationSide[] = ['near', 'far'];
const MODES: readonly ConversationMode[] = ['person', 'tutor'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readLanguageId(value: unknown): LanguageId | undefined {
  return typeof value === 'string' && getLanguage(value) ? value : undefined;
}

function readTurn(payload: unknown): ConversationTurn | undefined {
  if (!isRecord(payload)) return undefined;

  const id = typeof payload.id === 'string' && payload.id.length > 0 ? payload.id : undefined;
  const side = SIDES.includes(payload.side as ConversationSide)
    ? (payload.side as ConversationSide)
    : undefined;
  const heard = typeof payload.heard === 'string' ? payload.heard : undefined;
  const sourceLanguage = readLanguageId(payload.sourceLanguage);
  const targetLanguage = readLanguageId(payload.targetLanguage);

  if (!id || !side || heard === undefined || !sourceLanguage || !targetLanguage) return undefined;

  const turn: ConversationTurn = { id, side, heard, sourceLanguage, targetLanguage };
  // Each is an opaque, already-validated shape by the time it is first
  // written; a record here is enough to trust it back onto the turn.
  if (isRecord(payload.result)) turn.result = payload.result as ConversationTurn['result'];
  if (isRecord(payload.error)) turn.error = payload.error as ConversationTurn['error'];
  if (isRecord(payload.tutor)) turn.tutor = payload.tutor as ConversationTurn['tutor'];
  return turn;
}

function readTurns(payload: unknown): ConversationTurn[] {
  if (!Array.isArray(payload)) return [];
  const turns: ConversationTurn[] = [];
  for (const entry of payload) {
    const turn = readTurn(entry);
    if (turn) turns.push(turn);
  }
  return turns;
}

/** Parses a stored transcript, always returning something usable. */
export function parseConversationHistory(payload: unknown): TurnsByMode {
  if (!isRecord(payload)) return EMPTY_CONVERSATION_TURNS;
  const turns = payload.turns;
  if (!isRecord(turns)) return EMPTY_CONVERSATION_TURNS;

  const result: Record<string, readonly ConversationTurn[]> = {};
  for (const mode of MODES) result[mode] = readTurns(turns[mode]);
  return result as TurnsByMode;
}

export function serializeConversationHistory(turns: TurnsByMode): string {
  return JSON.stringify({ version: CONVERSATION_HISTORY_VERSION, turns });
}
