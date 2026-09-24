import Purchases, { LOG_LEVEL, type CustomerInfo } from 'react-native-purchases';

import type { Unsubscribe } from '@/types';
import { createLogger } from '@/utils';

import type { Capability, Entitlements, EntitlementsService, Plan } from './entitlements-service';
import { defaultEntitlements, entitlementsFor } from './plan-capabilities';

const log = createLogger('entitlements.revenuecat');

/**
 * The plan, as RevenueCat reports it.
 *
 * This is the implementation the contract was shaped for. `EntitlementsService`
 * has deliberately never had a setter, so replacing the local one with this
 * changes no call site: every screen already asks `has(capability)` and gets
 * an answer, and none of them can tell where it came from.
 *
 * **One entitlement, not one per capability.** RevenueCat answers "is this
 * person subscribed"; the capability table answers "what does a subscriber
 * get". Keeping those separate means adding a Pro feature is an edit to
 * `PLAN_CAPABILITIES` rather than a change to a dashboard and a release.
 *
 * The SDK key is public by design — it identifies the app, it does not
 * authorise anything, and RevenueCat's own documentation says to ship it. The
 * *secret* key is a different thing entirely and must never come near a
 * bundle.
 */

/** The identifier configured in the RevenueCat dashboard. */
export const PRO_ENTITLEMENT = 'pro';

export type RevenueCatOptions = {
  /** The public SDK key. Absent means the service reports everyone as Free. */
  apiKey?: string;
  /** Verbose SDK logging. Development only. */
  debug?: boolean;
};

/** Reads the plan out of whatever RevenueCat last said. */
function planFrom(info: CustomerInfo): Plan {
  return info.entitlements.active[PRO_ENTITLEMENT] ? 'pro' : 'free';
}

export function createRevenueCatEntitlementsService(
  options: RevenueCatOptions,
): EntitlementsService {
  const { apiKey, debug = false } = options;

  let snapshot: Entitlements = defaultEntitlements();
  const listeners = new Set<() => void>();
  let configured = false;

  const publish = (next: Entitlements) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };

  /**
   * Turns whatever the SDK reports into a snapshot.
   *
   * `source: 'account'` is the point of this implementation: the plan was
   * issued after a receipt was validated by somebody other than the phone,
   * which is exactly the distinction that field was reserved for.
   */
  const apply = (info: CustomerInfo) => publish(entitlementsFor(planFrom(info), 'account'));

  return {
    id: 'entitlements.revenuecat',

    async isAvailable() {
      return Boolean(apiKey);
    },

    current() {
      return snapshot;
    },

    has(capability: Capability) {
      return snapshot.capabilities.has(capability);
    },

    subscribe(listener: () => void): Unsubscribe {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    /**
     * Configures the SDK and reads the current plan.
     *
     * Never rejects. A build with no key, a device with no Play Services and a
     * network that is simply down all resolve to Free, because the alternative
     * is an app that will not start for someone standing in a queue abroad —
     * and Free is the whole product minus the adverts.
     */
    async load(): Promise<Entitlements> {
      if (!apiKey) {
        // Expected in a build configured without billing. Not an error.
        log.debug('no RevenueCat key; everyone is Free');
        return snapshot;
      }

      try {
        if (!configured) {
          if (debug) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

          // No appUserID: RevenueCat generates an anonymous one per install,
          // which is what lets this work with no sign-in. Purchases follow
          // the store account, not an identity we hold.
          Purchases.configure({ apiKey });

          // Registered once. Renewals, cancellations and restores all arrive
          // here, so a lapse takes effect without the app being reopened.
          Purchases.addCustomerInfoUpdateListener(apply);
          configured = true;
        }

        apply(await Purchases.getCustomerInfo());
      } catch (cause) {
        // The message can name the store account, so only the fact is logged.
        log.warn('could not read the plan; treating as Free');
        void cause;
      }

      return snapshot;
    },
  };
}
