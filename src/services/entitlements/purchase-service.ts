import type { Service, ServiceResult } from '../types';

/**
 * Selling the plan, kept apart from reading it.
 *
 * `EntitlementsService` deliberately has no setter, because nothing above the
 * service layer may change what somebody is entitled to. That rule still
 * holds here: this service cannot grant a plan either. It asks the store to
 * take money, and the store tells RevenueCat, and RevenueCat tells the
 * entitlements service through the listener it already registered. A purchase
 * therefore reaches the UI by the same path a renewal or a refund does.
 *
 * Splitting it in two is what keeps that true. If one service both sold and
 * granted, the granting half would be one careless edit away from being
 * callable without a receipt.
 */

/** How often a plan renews. Only the periods the app actually sells. */
export type BillingPeriod = 'month' | 'year';

/**
 * A purchasable plan, as the store describes it.
 *
 * `price` is the store's own localised string — "$4.99", "₹449", "£3.99" —
 * not a number and not anything this app formats. Play returns the price in
 * the user's currency, already rounded to that market's conventions, and
 * showing anything else would be quoting a price we cannot charge.
 */
export type PurchasePlan = {
  /** The RevenueCat package identifier. What `purchase` takes. */
  readonly id: string;
  /** The store product, for matching against configuration. */
  readonly productId: string;
  /** Localised and ready to display. Never parsed. */
  readonly price: string;
  readonly period: BillingPeriod;
};

export type PurchaseService = Service & {
  /**
   * What is for sale right now, cheapest period last.
   *
   * Empty is a legitimate answer, not a failure: a build without billing
   * configured, or a device with no Play Services, has nothing to sell.
   */
  plans(): ServiceResult<readonly PurchasePlan[]>;

  /**
   * Opens the store's purchase sheet for a plan.
   *
   * Backing out is reported as `cancelled`, which callers are expected to
   * swallow silently — a user who changed their mind has not hit an error and
   * must not be shown one.
   */
  purchase(planId: string): ServiceResult<void>;

  /**
   * Restores purchases already made with this store account.
   *
   * Resolves to whether anything was found. Required by both stores, and the
   * only way back to Pro after a reinstall or a new device, because Translita
   * has no accounts of its own.
   */
  restore(): ServiceResult<boolean>;
};
