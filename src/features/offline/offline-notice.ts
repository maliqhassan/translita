import { getLanguage } from '@/constants';
import type { OfflineReadiness } from '@/services';
import type { LanguageId } from '@/types';

/**
 * What to tell someone whose on-device translation cannot run.
 *
 * Copy lives here rather than in `constants/messages.ts` because it needs
 * `OfflineReadiness`, and constants sits below services in the dependency
 * rule. The generic `errorMessage` map stays where it is; this is the
 * offline-specific layer on top of it.
 *
 * Each case names the actual obstacle and, where one exists, the next step.
 * "Translation failed" is never the answer when the real reason is a language
 * pack the user could download in two taps.
 */

export type OfflineNotice = {
  title: string;
  description: string;
  /** Present only when there is somewhere useful to send the user. */
  actionLabel?: string;
  /**
   * Where that action goes.
   *
   * Defaults to the packs screen, which is where every readiness notice led
   * before plans existed. An entitlement problem leads to the paywall
   * instead — sending someone to download a pack they may not use is a dead
   * end, and the reverse offers an upgrade to someone who only needs a file.
   */
  actionTarget?: 'packs' | 'upgrade';
};

/**
 * What to say when on-device translation is not included in the plan.
 *
 * Separate from `offlineNotice` below, which answers "is the device ready".
 * Readiness and entitlement are different questions with different fixes, and
 * a missing pack is never the reason when the feature itself is not theirs.
 */
export function offlineEntitlementNotice(): OfflineNotice {
  return {
    title: 'Offline translation is part of Translita Pro',
    description:
      'Pro translates with no connection at all, using language packs stored on your device. Online translation stays available on the free plan.',
    actionLabel: 'See what Pro includes',
    actionTarget: 'upgrade',
  };
}

/** Joins names the way a sentence would: "English and German". */
function listNames(languages: readonly LanguageId[]): string {
  const names = languages.map((id) => getLanguage(id)?.name ?? id);
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

export function offlineNotice(readiness: OfflineReadiness): OfflineNotice | undefined {
  switch (readiness.kind) {
    case 'ready':
      return undefined;

    case 'runtime_missing':
      return {
        title: 'On-device translation is not in this build',
        description:
          'It needs the native translation module, which is only present in a development or release build. Switch to Automatic or Online to translate for now.',
      };

    case 'source_undetectable':
      return {
        title: 'Choose a language to translate from',
        description:
          'On-device translation cannot detect the language automatically. Pick the source language and try again.',
      };

    case 'unsupported':
      return {
        title: `${listNames(readiness.languages)} cannot be translated on device`,
        description:
          'There is no on-device model for it, so a download cannot fix this. Switch to Automatic or Online to translate this pair.',
      };

    case 'packs_missing':
      return {
        title: `${listNames(readiness.languages)} not downloaded`,
        description:
          'On-device translation needs a language pack for each side of the pair. Download the required language pack in Settings, Language Packs.',
        actionLabel: 'Open Language Packs',
      };
  }
}
