import Purchases, { LOG_LEVEL } from 'react-native-purchases';

/**
 * The one place the RevenueCat SDK is configured.
 *
 * Two services talk to RevenueCat — one reads the plan, one sells it — and
 * `Purchases.configure` must be called exactly once per process. Neither
 * service can own that call without the other having to know whether it
 * already happened, so the call lives here and both ask this module.
 *
 * The SDK key is public by design: it identifies the app, it authorises
 * nothing, and RevenueCat's own documentation says to ship it. The *secret*
 * key is a different thing entirely and must never come near a bundle.
 */

export type RevenueCatOptions = {
  /** The public SDK key. Absent means RevenueCat is not used at all. */
  apiKey?: string;
  /** Verbose SDK logging. Development only. */
  debug?: boolean;
};

let configured = false;

/**
 * Configures the SDK once, and reports whether it is usable.
 *
 * Returns `false` for a build with no key, which is a supported
 * configuration rather than an error: the app runs, everybody is Free, and
 * nothing is for sale.
 */
export function configureRevenueCat(options: RevenueCatOptions): boolean {
  const { apiKey, debug = false } = options;

  if (!apiKey) return false;
  if (configured) return true;

  if (debug) Purchases.setLogLevel(LOG_LEVEL.DEBUG);

  // No appUserID: RevenueCat generates an anonymous one per install, which is
  // what lets this work with no sign-in. Purchases follow the store account,
  // not an identity we hold.
  Purchases.configure({ apiKey });
  configured = true;

  return true;
}
