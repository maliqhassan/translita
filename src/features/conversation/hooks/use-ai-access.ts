import { AI_TRIAL_TURNS } from '@/constants';
import { useEntitlements, usePreferences } from '@/store';

/**
 * Whether an AI practice exchange may happen right now, and what to say if not.
 *
 * One rule in one place, because there are three callers that must agree: the
 * toggle that offers practice, the microphone that starts it, and the screen
 * that explains why it stopped. Three copies of "has the allowance run out"
 * would eventually disagree, and the disagreement would either give the
 * feature away or refuse a paying subscriber.
 *
 * Deliberately *not* `resolveFeatureAccess`. That rule's middle question is
 * "can this device do it", and the device has nothing to do with this: the
 * work happens on a server. Passing something invented for `supported` would
 * make the call read as a three-layer check while testing two.
 */

export type AiAccess = {
  /** Whether a turn may be spoken now. */
  allowed: boolean;
  /** True for a subscriber: no counting, no allowance, no prompts. */
  unlimited: boolean;
  /** Exchanges left in the free allowance. Zero once spent. */
  remaining: number;
  /** Records a turn against the allowance. A no-op for a subscriber. */
  spend: () => void;
};

export function useAiAccess(): AiAccess {
  const { has } = useEntitlements();
  const { preferences, update } = usePreferences();

  const unlimited = has('aiTutor');
  const used = preferences.aiTurnsUsed;
  const remaining = Math.max(0, AI_TRIAL_TURNS - used);

  return {
    unlimited,
    allowed: unlimited || remaining > 0,
    remaining: unlimited ? AI_TRIAL_TURNS : remaining,

    spend: () => {
      // A subscriber is never counted. Counting them would mean the number
      // kept climbing, and the day the plan lapsed they would find their
      // allowance already spent by their own subscription.
      if (unlimited) return;
      update({ aiTurnsUsed: used + 1 });
    },
  };
}
