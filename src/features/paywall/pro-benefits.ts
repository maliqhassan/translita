import type { IconName } from '@/components';
import type { Capability } from '@/services';

/**
 * What Transee Pro is, in the user's words.
 *
 * Each line names the capability it stands for, so the list cannot drift out
 * of step with `PLAN_CAPABILITIES` without a test noticing. Copy lives in the
 * feature rather than in `src/constants`, because constants may not import
 * from the service layer — the same reason `offlineNotice` lives in the
 * offline feature.
 *
 * The list is short on purpose. It used to name Camera OCR, dictation and
 * on-device translation, all of which are now part of the free app, and a
 * paywall that lists what the reader already has is not persuasive — it is
 * untrue. The rule enforced by test is that this names exactly the
 * capabilities Free does *not* hold.
 */
export type ProBenefit = {
  capability: Capability;
  icon: IconName;
  title: string;
  description: string;
};

export const PRO_BENEFITS: readonly ProBenefit[] = [
  {
    capability: 'adFree',
    icon: 'sparkles-outline',
    title: 'No ads',
    description: 'Remove every advertisement in the app. Nothing else changes.',
  },
];

/**
 * What both plans include, said plainly next to the one thing Pro adds.
 *
 * These are not capabilities to check — they are the whole app, and they are
 * listed so the paywall reads as "this is what you already have" rather than
 * implying that anything here is withheld. Nothing branches on this; it is
 * copy.
 */
export type IncludedFeature = {
  icon: IconName;
  title: string;
};

export const INCLUDED_ON_EVERY_PLAN: readonly IncludedFeature[] = [
  { icon: 'language-outline', title: 'Online translation' },
  { icon: 'cloud-offline-outline', title: 'Offline translation and language packs' },
  { icon: 'camera-outline', title: 'Camera text recognition' },
  { icon: 'mic-outline', title: 'Speech-to-text dictation' },
  { icon: 'volume-high-outline', title: 'Text-to-speech, with voice and speed settings' },
  { icon: 'time-outline', title: 'Translation history' },
];
