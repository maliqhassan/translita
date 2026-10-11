import type { LanguageId } from '@/types';
import { createLogger, ok } from '@/utils';

import type { PreferencesStorage } from '../preferences';
import type { ServiceResult } from '../types';

const log = createLogger('phrases.saved');

/**
 * A phrase the user kept, with its translation stored beside it.
 *
 * The translation is saved, not fetched again, which is the whole point: a
 * saved phrase can be shown or read aloud on a plane, in a taxi or anywhere
 * else with no connection and no language pack.
 */
export type SavedPhrase = {
  id: string;
  text: string;
  translation: string;
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  /** Epoch milliseconds. Newest first on screen. */
  savedAt: number;
};

/** Enough for any trip; past this the oldest are dropped on save. */
export const SAVED_PHRASES_LIMIT = 500;

/**
 * The same phrase in the same pair is one saved phrase, however often it is
 * saved, so the id is derived from what it is rather than when it was saved.
 */
export function savedPhraseId(text: string, source: LanguageId, target: LanguageId): string {
  return `${source}|${target}|${text.trim().toLocaleLowerCase()}`;
}

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Keeps only well-formed phrases from stored JSON, newest first. Anything
 * malformed is dropped rather than failing the whole list.
 */
export function parseSavedPhrases(raw: unknown): SavedPhrase[] {
  const list =
    typeof raw === 'object' && raw !== null && Array.isArray((raw as { phrases?: unknown }).phrases)
      ? (raw as { phrases: unknown[] }).phrases
      : [];

  const phrases: SavedPhrase[] = [];
  for (const item of list) {
    if (typeof item !== 'object' || item === null) continue;
    const entry = item as Record<string, unknown>;
    if (
      !isText(entry.text) ||
      !isText(entry.translation) ||
      !isText(entry.sourceLanguage) ||
      !isText(entry.targetLanguage)
    ) {
      continue;
    }
    phrases.push({
      id: savedPhraseId(entry.text, entry.sourceLanguage, entry.targetLanguage),
      text: entry.text,
      translation: entry.translation,
      sourceLanguage: entry.sourceLanguage,
      targetLanguage: entry.targetLanguage,
      savedAt: typeof entry.savedAt === 'number' ? entry.savedAt : 0,
    });
  }

  return phrases.sort((a, b) => b.savedAt - a.savedAt).slice(0, SAVED_PHRASES_LIMIT);
}

export function serializeSavedPhrases(phrases: readonly SavedPhrase[]): string {
  return JSON.stringify({ version: 1, phrases: phrases.slice(0, SAVED_PHRASES_LIMIT) });
}

/**
 * The user's saved phrases, in one small file on the device.
 *
 * `load` never fails outward: unreadable storage or invalid JSON is an empty
 * list, so the Phrases screen always opens.
 */
export type SavedPhrasesService = {
  load(): Promise<SavedPhrase[]>;
  save(phrases: readonly SavedPhrase[]): ServiceResult<void>;
};

export function createSavedPhrasesService(storage: PreferencesStorage): SavedPhrasesService {
  return {
    async load() {
      const stored = await storage.read();
      if (!stored.ok) {
        log.warn('saved phrases unreadable; starting empty');
        return [];
      }
      if (stored.value === null) return [];

      try {
        return parseSavedPhrases(JSON.parse(stored.value) as unknown);
      } catch {
        log.warn('saved phrases were not valid JSON; starting empty');
        return [];
      }
    },

    async save(phrases) {
      const written = await storage.write(serializeSavedPhrases(phrases));
      return written.ok ? ok(undefined) : written;
    },
  };
}
