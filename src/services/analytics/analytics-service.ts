import type {
  AppError,
  AppErrorCode,
  LanguageId,
  TranslationEngine,
  TranslationSource,
} from '@/types';

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
  /** A day of the course was started fresh, not resumed. */
  | { name: 'lesson_start'; params: { course: LanguageId; day: number; checkpoint: boolean } }
  /** One part of a day was finished: where learners stop shows up as the gap. */
  | {
      name: 'lesson_section_complete';
      params: {
        course: LanguageId;
        day: number;
        section: 'learn' | 'practise' | 'speak' | 'review' | 'conversation';
      };
    }
  /** The AI partner answered, in a lesson or in the final exam. */
  | { name: 'roleplay_turn'; params: { course: LanguageId; final: boolean } }
  /** The AI partner could not answer. The code, never the conversation. */
  | { name: 'roleplay_failed'; params: { course: LanguageId; final: boolean; code: AppErrorCode } }
  /** The placement check placed a learner at a day. */
  | { name: 'placement_done'; params: { course: LanguageId; start_day: number } }
  /** A part of the final exam was marked, passed or not. */
  | {
      name: 'final_part_done';
      params: {
        course: LanguageId;
        part: 'written' | 'conversation';
        passed: boolean;
        score_percent: number;
      };
    }
  /** The mistakes practice was opened. */
  | { name: 'academy_practice_open'; params: { course: LanguageId } }
  /** Daily lesson reminders were switched on. */
  | { name: 'reminder_enabled'; params: { hour: number } }
  /**
   * Translita's server failed and the maintenance message was shown. Counted
   * so an outage is visible in Firebase before the reviews say so.
   */
  | { name: 'server_down'; params: { feature: 'translate' | 'conversation' | 'academy' } }
  /** A translation on the home screen came back. */
  | {
      name: 'translation';
      params: {
        method: TranslationSource;
        source_language: LanguageId;
        target_language: LanguageId;
        /** Which engine answered: `online` is a call to Translita's server. */
        engine: TranslationEngine;
        /** From pressing Translate to the answer. */
        duration_ms: number;
        /** How long the text was, as a band — never the text. */
        length: TextLengthBand;
      };
    }
  /** A translation could not be made. */
  | { name: 'translation_failed'; params: { method: TranslationSource; code: AppErrorCode } }
  /** A translation was copied. */
  | { name: 'translation_copied' }
  /** A translation was shared to another app. */
  | { name: 'translation_shared'; params: { from: 'translate' | 'conversation' } }
  /** The camera read a photo. */
  | { name: 'camera_scan'; params: { ok: boolean; found_words: boolean } }
  /** An offline language pack was downloaded or removed. */
  | {
      name: 'language_pack';
      params: { action: 'download' | 'remove'; pack: string; ok: boolean };
    }
  /** A full-screen ad was shown, of either kind. */
  | { name: 'ad_shown'; params: { format: 'interstitial' | 'app_open' } }
  /** A purchase was started and did not go through, cancelled included. */
  | { name: 'purchase_not_completed'; params: { plan: string; code: AppErrorCode } }
  /** A first-time user reached a step of onboarding. */
  | {
      name: 'onboarding_step';
      params: { step: 'loading' | 'language' | 'welcome' | 'tour' | 'pro' };
    }
  /** Onboarding was finished and Home opened for the first time. */
  | { name: 'onboarding_complete' }
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

/**
 * Who someone is, attached to every event they send — including the
 * `app_remove` Firebase records on its own when the app is uninstalled, which
 * is how uninstalls can be split by plan, course and progress.
 */
export type AnalyticsUserProperty =
  | { name: 'plan'; value: 'free' | 'pro' | 'elite' }
  /** The course being learned, or `none` before one is started. */
  | { name: 'academy_course'; value: LanguageId | 'none' }
  /** How far into the course, in a few broad bands. */
  | { name: 'academy_day'; value: AcademyDayBand }
  /** The language the app is shown in. */
  | { name: 'app_language'; value: string }
  /** Auto, online only or on-device only. */
  | { name: 'translation_mode'; value: string }
  /** Whether daily lesson reminders are on. */
  | { name: 'reminders'; value: 'on' | 'off' };

export type TextLengthBand = '1-20' | '21-100' | '101-500' | '500+';

/** A text's length as a band: enough to see usage, never the text itself. */
export function textLengthBand(length: number): TextLengthBand {
  if (length <= 20) return '1-20';
  if (length <= 100) return '21-100';
  if (length <= 500) return '101-500';
  return '500+';
}

export type AcademyDayBand = '0' | '1' | '2-5' | '6-20' | '21-60' | 'done';

/** Days completed, as a band: broad enough to stay a handful of values. */
export function academyDayBand(daysDone: number, graduated: boolean): AcademyDayBand {
  if (graduated) return 'done';
  if (daysDone <= 0) return '0';
  if (daysDone === 1) return '1';
  if (daysDone <= 5) return '2-5';
  if (daysDone <= 20) return '6-20';
  return '21-60';
}

/** Counts a server failure, if that is what the error was. */
export function logIfServerDown(
  analytics: AnalyticsService,
  feature: 'translate' | 'conversation' | 'academy',
  error: AppError,
): void {
  if (error.code === 'server_down' || error.code === 'invalid_response') {
    analytics.log({ name: 'server_down', params: { feature } });
  }
}

/**
 * Usage analytics, fire and forget.
 *
 * Neither method returns anything a caller could wait on or fail on: a lost
 * analytics event must never slow down or break what the user is doing. In a
 * build without the native SDK (Expo Go) both do nothing.
 */
export type AnalyticsService = Service & {
  log(event: AnalyticsEvent): void;
  /** A screen came into view: Firebase's screen_view, with time on screen. */
  screen(name: string): void;
  setUserProperty(property: AnalyticsUserProperty): void;
};

/** What a build without analytics gets: the same calls, doing nothing. */
export const noopAnalyticsService: AnalyticsService = {
  id: 'analytics.noop',
  async isAvailable() {
    return false;
  },
  log() {},
  screen() {},
  setUserProperty() {},
};
