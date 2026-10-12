import type { LanguageId, TranslationSource } from '@/types';

import type { Service } from '../types';

/**
 * Every usage event the app records, and nothing else.
 *
 * A closed list rather than a free-form `log(name, params)` so the whole of
 * what leaves the phone can be read in one place. No event carries text the
 * user typed, spoke or saved — only which feature was used, and language
 * codes. The privacy policy says so, and a test keeps it true.
 */
export type AnalyticsEvent =
  /** The Pro screen was opened. */
  | { name: 'paywall_view'; params: { source: 'onboarding' | 'app' | 'academy' } }
  /** A subscription purchase went through. */
  | { name: 'subscription_started'; params: { period: 'month' | 'year' } }
  /** An Elite purchase went through. */
  | { name: 'elite_started' }
  /** The Academy was opened, from the translator or a link back to it. */
  | { name: 'academy_open' }
  /** Someone finished the Academy's onboarding and started a course. */
  | { name: 'academy_onboarding_done'; params: { course: LanguageId; minutes: number } }
  /** Both parts of the final exam were passed: the course is complete. */
  | { name: 'final_passed'; params: { course: LanguageId; level: string } }
  /** A day of the course was finished. */
  | {
      name: 'lesson_complete';
      params: { course: LanguageId; day: number; checkpoint: boolean; passed: boolean };
    }
  /** A translation on the home screen came back. */
  | {
      name: 'translation';
      params: {
        method: TranslationSource;
        source_language: LanguageId;
        target_language: LanguageId;
      };
    }
  /** The Conversation screen was opened, or switched to the other mode. */
  | { name: 'conversation_open'; params: { mode: 'person' | 'practice' } }
  /** One sentence was spoken and answered in Conversation. */
  | { name: 'conversation_turn'; params: { mode: 'person' | 'practice' } }
  /** The Phrases screen was opened. */
  | { name: 'phrases_open' }
  /** A phrase was saved to the user's own list. */
  | { name: 'phrase_saved'; params: { from: 'phrasebook' | 'translation' } }
  /** A phrase was read aloud. */
  | { name: 'phrase_played' };

export type AnalyticsUserProperty = { name: 'plan'; value: 'free' | 'pro' | 'elite' };

/**
 * Usage analytics, fire and forget.
 *
 * Neither method returns anything a caller could wait on or fail on: a lost
 * analytics event must never slow down or break what the user is doing. In a
 * build without the native SDK (Expo Go) both do nothing.
 */
export type AnalyticsService = Service & {
  log(event: AnalyticsEvent): void;
  setUserProperty(property: AnalyticsUserProperty): void;
};

/** What a build without analytics gets: the same calls, doing nothing. */
export const noopAnalyticsService: AnalyticsService = {
  id: 'analytics.noop',
  async isAvailable() {
    return false;
  },
  log() {},
  setUserProperty() {},
};
