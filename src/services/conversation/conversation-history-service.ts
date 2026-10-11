import { createLogger, ok } from '@/utils';

import type { PreferencesStorage } from '../preferences';
import type { ServiceResult } from '../types';

import {
  parseConversationHistory,
  serializeConversationHistory,
} from './conversation-history-schema';
import { EMPTY_CONVERSATION_TURNS, type TurnsByMode } from './conversation-types';

const log = createLogger('conversation.history');

/**
 * Whether a spoken conversation survives closing the app.
 *
 * Reuses `PreferencesStorage` for the same reason the local entitlements
 * service does: the need is one small named slot of JSON, and that seam
 * already has a file-backed implementation and an in-memory one for tests.
 * Nothing new is installed for this, and no SQL is involved — a transcript is
 * cleared by the user, not searched, paginated or favourited, which is what
 * makes it a blob rather than a table.
 *
 * `load` never fails outward: unreadable storage, invalid JSON and a
 * malformed turn all resolve to an empty transcript rather than stopping the
 * screen from opening.
 */
export type ConversationHistoryService = {
  load(): Promise<TurnsByMode>;
  save(turns: TurnsByMode): ServiceResult<void>;
};

export function createConversationHistoryService(
  storage: PreferencesStorage,
): ConversationHistoryService {
  return {
    async load() {
      const stored = await storage.read();

      if (!stored.ok) {
        log.warn('conversation history unreadable; starting empty');
        return EMPTY_CONVERSATION_TURNS;
      }

      // Nothing written yet is a first launch, or a cleared transcript, not a
      // failure.
      if (stored.value === null) return EMPTY_CONVERSATION_TURNS;

      try {
        return parseConversationHistory(JSON.parse(stored.value) as unknown);
      } catch {
        log.warn('conversation history was not valid JSON; starting empty');
        return EMPTY_CONVERSATION_TURNS;
      }
    },

    async save(turns: TurnsByMode): ServiceResult<void> {
      const written = await storage.write(serializeConversationHistory(turns));
      return written.ok ? ok(undefined) : written;
    },
  };
}
