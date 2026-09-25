import { useCallback, useEffect, useState } from 'react';

import { services, type PurchasePlan } from '@/services';
import type { AsyncState } from '@/types';

/**
 * The paywall's state, with every store call kept out of the screen.
 *
 * The screen renders three things — what is for sale, whether something is in
 * flight, and what went wrong — and calls two. It never sees a package, a
 * receipt or an SDK type, which is what keeps the "no business logic in
 * screens" rule true for the one screen that handles money.
 *
 * Nothing here sets a plan. A completed purchase reaches the UI because the
 * entitlements service is listening to RevenueCat, so this hook's own return
 * value is only ever about the *attempt*.
 */

export type PurchaseState = {
  /** What the store is offering. Empty until loaded, and possibly after. */
  plans: AsyncState<readonly PurchasePlan[]>;
  /** True while a purchase or restore is in flight. Disables the buttons. */
  busy: boolean;
  /**
   * What to tell the user about the last attempt, or null.
   *
   * A cancelled purchase leaves this null: backing out is not an error and
   * must not be reported as one.
   */
  notice: string | null;
  buy: (planId: string) => Promise<void>;
  restore: () => Promise<void>;
};

export function usePurchase(): PurchaseState {
  /*
   * Starts loading rather than idle, because the effect below always runs on
   * mount. Setting it inside the effect would be a second render before the
   * first has painted, for a state that is never observably idle.
   */
  const [plans, setPlans] = useState<AsyncState<readonly PurchasePlan[]>>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void services.purchases.plans().then((result) => {
      if (!active) return;

      setPlans(
        result.ok
          ? { status: 'success', data: result.value }
          : { status: 'error', error: result.error },
      );
    });

    return () => {
      active = false;
    };
  }, []);

  const buy = useCallback(async (planId: string) => {
    setBusy(true);
    setNotice(null);

    const result = await services.purchases.purchase(planId);

    setBusy(false);

    // Backing out of the store sheet is a decision, not a failure. Saying
    // anything at all here would be scolding somebody for changing their mind.
    if (result.ok || result.error.code === 'cancelled') return;

    setNotice(result.error.message);
  }, []);

  const restore = useCallback(async () => {
    setBusy(true);
    setNotice(null);

    const result = await services.purchases.restore();

    setBusy(false);

    if (!result.ok) {
      setNotice(result.error.message);
      return;
    }

    /*
     * Reports only what the store said. Whether the restored purchase makes
     * this person Pro is the entitlements service's answer, arriving on its
     * own listener — so a successful restore says "found", never "you are Pro".
     */
    setNotice(
      result.value
        ? 'Purchases restored.'
        : 'No previous purchase was found for this store account.',
    );
  }, []);

  return { plans, busy, notice, buy, restore };
}
