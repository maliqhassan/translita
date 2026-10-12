import type { IconName } from '@/components';
import { msg } from '@/i18n';

/**
 * What Elite adds, in the words the paywall uses.
 *
 * Only what is really sold: the course past its free first day, the AI
 * behind it, and the ads gone from the translator too — Elite includes Pro.
 */
export type EliteBenefit = { icon: IconName; title: string; description: string };

export const ELITE_BENEFITS: readonly EliteBenefit[] = [
  {
    icon: 'calendar',
    title: msg('All 60 days of the course'),
    description: msg('Twelve chapters, from your first words to real conversations.'),
  },
  {
    icon: 'chatbubbles',
    title: msg('Live conversations with your AI coach'),
    description: msg('Role-play every day, with each mistake corrected and explained.'),
  },
  {
    icon: 'mic',
    title: msg('Speaking practice, marked as you talk'),
    description: msg('Say words, sentences and your part of each conversation out loud.'),
  },
  {
    icon: 'ribbon',
    title: msg('Final exam, report and certificate'),
    description: msg('Your strong and weak points, and what to practise next.'),
  },
  {
    icon: 'ban',
    title: msg('No ads anywhere'),
    description: msg('Elite includes Pro, so the translator is ad-free too.'),
  },
];
