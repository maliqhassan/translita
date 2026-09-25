import Purchases, { PACKAGE_TYPE, type PurchasesPackage } from 'react-native-purchases';

import { appError, createLogger, err, ok } from '@/utils';

import type { BillingPeriod, PurchasePlan, PurchaseService } from './purchase-service';
import { configureRevenueCat, type RevenueCatOptions } from './revenuecat-client';

const log = createLogger('purchases.revenuecat');

/**
 * Buying Pro through Google Play, by way of RevenueCat.
 *
 * Nothing here grants anything. `purchasePackage` hands the user to Play's own
 * sheet; if they pay, RevenueCat validates the receipt server-side and pushes
 * the new customer info to the listener the entitlements service registered.
 * That is why this file never touches a plan or a capability: it cannot, and
 * it should not be able to.
 */

/** Only the two periods the app sells. Anything else is ignored. */
const PERIODS: Partial<Record<PACKAGE_TYPE, BillingPeriod>> = {
  [PACKAGE_TYPE.MONTHLY]: 'month',
  [PACKAGE_TYPE.ANNUAL]: 'year',
};

/** Longest period first, so the better-value plan leads. */
const PERIOD_ORDER: readonly BillingPeriod[] = ['year', 'month'];

function describe(item: PurchasesPackage, period: BillingPeriod): PurchasePlan {
  return {
    id: item.identifier,
    productId: item.product.identifier,
    // The store's own localised string. Never parsed, never reformatted.
    price: item.product.priceString,
    period,
  };
}

/**
 * Whether a rejection is the user backing out of the store sheet.
 *
 * The SDK reports this as a flag on the rejection rather than an error code,
 * and it matters: a cancellation must never surface as a failure.
 */
function wasCancelled(cause: unknown): boolean {
  return (
    typeof cause === 'object' &&
    cause !== null &&
    'userCancelled' in cause &&
    (cause as { userCancelled?: boolean | null }).userCancelled === true
  );
}

export function createRevenueCatPurchaseService(options: RevenueCatOptions): PurchaseService {
  const { apiKey } = options;

  /**
   * The packages last read from the store, by identifier.
   *
   * `purchasePackage` needs the object the SDK handed out, not a description
   * of it, so the screen passes back an id and this maps it. It also means a
   * purchase can only ever be attempted for something the store actually
   * offered, rather than for an id assembled somewhere in the UI.
   */
  const packages = new Map<string, PurchasesPackage>();

  return {
    id: 'purchases.revenuecat',

    async isAvailable() {
      return Boolean(apiKey);
    },

    async plans() {
      if (!configureRevenueCat(options)) {
        // Expected in a build configured without billing. Not an error.
        log.debug('no RevenueCat key; nothing is for sale');
        return ok([]);
      }

      try {
        const offerings = await Purchases.getOfferings();
        const current = offerings.current;

        if (!current) {
          /*
           * Configuration, not breakage: no offering has been marked current
           * in the dashboard, or none of its products are live in Play. An
           * empty paywall is the honest outcome, and far better than an error
           * the user can do nothing about.
           */
          log.warn('no current offering; nothing to sell');
          return ok([]);
        }

        packages.clear();

        const plans: PurchasePlan[] = [];
        for (const item of current.availablePackages) {
          const period = PERIODS[item.packageType];
          // A weekly or lifetime package added in the dashboard is ignored
          // rather than guessed at, so the screen never shows a plan the app
          // has no copy for.
          if (!period) continue;

          packages.set(item.identifier, item);
          plans.push(describe(item, period));
        }

        plans.sort((a, b) => PERIOD_ORDER.indexOf(a.period) - PERIOD_ORDER.indexOf(b.period));

        return ok(plans);
      } catch (cause) {
        log.warn('could not read the offerings');
        return err(appError('service_unavailable', 'Could not reach the store.', cause));
      }
    },

    async purchase(planId: string) {
      const item = packages.get(planId);

      if (!item) {
        // Either `plans` was never called or the offering changed underneath
        // us. Both are the caller's problem to retry, not the store's.
        return err(appError('invalid_request', 'That plan is no longer available.'));
      }

      try {
        await Purchases.purchasePackage(item);

        /*
         * Nothing is returned and nothing is granted. The receipt reaches
         * RevenueCat, which pushes new customer info to the entitlements
         * service's listener, which publishes to every subscriber. The UI
         * updates through the same path a renewal takes.
         */
        return ok(undefined);
      } catch (cause) {
        if (wasCancelled(cause)) {
          // Not a failure. Callers show nothing.
          return err(appError('cancelled', 'Purchase cancelled.'));
        }

        // The message can name the store account, so only the fact is logged.
        log.warn('the purchase did not complete');
        return err(appError('service_unavailable', 'The purchase could not be completed.', cause));
      }
    },

    async restore() {
      if (!configureRevenueCat(options)) return ok(false);

      try {
        const info = await Purchases.restorePurchases();

        /*
         * Reports only whether anything came back. What it *entitles* the user
         * to is the entitlements service's business, and it will already have
         * been told: `restorePurchases` publishes to the same listener.
         */
        return ok(Object.keys(info.entitlements.active).length > 0);
      } catch (cause) {
        log.warn('could not restore purchases');
        return err(appError('service_unavailable', 'Could not reach the store.', cause));
      }
    },
  };
}
