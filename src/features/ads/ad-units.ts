import { ADMOB } from '@/constants';

import { nativeAds } from './native-ads';

export type AdFormat = 'banner' | 'interstitial' | 'appOpen';

/**
 * The ad unit to request for a format, or null where there is no ads SDK.
 *
 * A release build asks for the real units from the AdMob console. A
 * development build — anything running through Metro — asks for Google's
 * published test units instead, from the SDK's own constants so they cannot
 * drift from the installed version. Requesting live ads while building and
 * testing the app counts as invalid traffic, and is how an AdMob account gets
 * limited or closed.
 *
 * The one place a unit is chosen, so the banner, the interstitial and the
 * app-open ad cannot disagree about which environment they are in.
 */
export function unitFor(format: AdFormat): string | null {
  if (!nativeAds) return null;

  if (__DEV__) {
    const { TestIds } = nativeAds;
    const test: Record<AdFormat, string> = {
      banner: TestIds.BANNER,
      interstitial: TestIds.INTERSTITIAL,
      appOpen: TestIds.APP_OPEN,
    };
    return test[format];
  }

  const live: Record<AdFormat, string> = {
    banner: ADMOB.bannerAdUnit,
    interstitial: ADMOB.interstitialAdUnit,
    appOpen: ADMOB.appOpenAdUnit,
  };
  return live[format];
}

/**
 * How long to wait before asking again after a request came back empty or
 * failed.
 *
 * The SDK never retries on its own, and retrying at once turns a phone with
 * no connection into a loop of requests — which AdMob reads as abuse. A
 * minute is long enough to be harmless and short enough that the next ad is
 * usually ready by the time it is due.
 */
export const AD_RETRY_DELAY_MS = 60_000;
