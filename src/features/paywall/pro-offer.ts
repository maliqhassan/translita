import { AD_PACING } from '@/constants';

/**
 * Whether this translation is the one that earns the Pro offer.
 *
 * Counted only up to the offer, and only once: after it, nothing more is
 * stored, and a user who already has no ads is never offered it.
 */
export function proOfferDue(
  translationsDone: number,
  proOffered: boolean,
  adFree: boolean,
): boolean {
  return !adFree && !proOffered && translationsDone + 1 >= AD_PACING.translationsBeforeProOffer;
}
