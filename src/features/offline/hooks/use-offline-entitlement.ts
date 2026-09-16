import { offlineTranslationPermittedFor } from '@/services';
import { useEntitlements } from '@/store';

/**
 * Whether the UI should present on-device translation as available.
 *
 * The same answer the routing policy acts on, reached through the same rule —
 * `offlineTranslationPermittedFor` — so a screen can never offer something
 * routing will refuse, or lock something routing would have allowed.
 *
 * Reactive, unlike `offlineTranslationPermitted()`: it reads the capability
 * from the store, so switching plan unlocks every gated control immediately
 * and without a restart.
 *
 * While `FEATURES.offlineEntitlement` is off this always answers true, which
 * is what keeps the entire Step 4 UX inert until the rollout flag flips.
 */
export function useOfflineTranslationPermitted(): boolean {
  const { has } = useEntitlements();
  return offlineTranslationPermittedFor(has('offlineTranslation'));
}
