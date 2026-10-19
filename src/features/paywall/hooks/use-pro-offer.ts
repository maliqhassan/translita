import { useRouter } from 'expo-router';
import { useCallback } from 'react';

import { AD_PACING, FABALITA_INVITES } from '@/constants';
import { useEntitlements, usePreferences } from '@/store';

import { proOfferDue } from '../pro-offer';

/** Translations are counted up to the last thing waiting on them, then no further. */
const COUNTED_UP_TO = Math.max(
  AD_PACING.translationsBeforeProOffer,
  FABALITA_INVITES.afterTranslations,
);

/**
 * Offers Pro once, after the first few translations.
 *
 * It used to be the last step of onboarding, where it reached people who had
 * not translated anything yet. Here it comes after the app has done what it
 * is for, a few times.
 */
export function useProOffer(): { noteTranslation: () => void } {
  const router = useRouter();
  const { preferences, update } = usePreferences();
  const { has, loaded } = useEntitlements();

  const adFree = has('adFree');

  const noteTranslation = useCallback(() => {
    if (!loaded || preferences.translationsDone >= COUNTED_UP_TO) return;
    const translationsDone = preferences.translationsDone + 1;
    if (proOfferDue(preferences.translationsDone, preferences.proOffered, adFree)) {
      update({ translationsDone, proOffered: true });
      router.push('/upgrade');
      return;
    }
    update({ translationsDone });
  }, [adFree, loaded, preferences.proOffered, preferences.translationsDone, router, update]);

  return { noteTranslation };
}
