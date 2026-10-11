import { usePathname, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { AD_PACING } from '@/constants';
import { useEntitlements } from '@/store';

import { AD_RETRY_DELAY_MS, unitFor } from '../ad-units';
import {
  fullScreenAdSpacingElapsed,
  noteFullScreenAdClosed,
  noteFullScreenAdShown,
  takeReturningFromAd,
} from '../full-screen-ads';
import { nativeAds } from '../native-ads';

/**
 * Google's own limit. An app-open ad left loaded longer than this is stale:
 * showing it fails, so it is replaced instead.
 */
const MAX_AD_AGE_MS = 4 * 60 * 60_000;

/** The Pro screen's route. No advert is ever drawn over someone about to pay. */
const UPGRADE_ROUTE = '/upgrade';

type AppOpen = { status: string; show: () => void; retry: () => void };

/** What a build without the ads SDK gets: an ad that never loads. */
const NO_APP_OPEN: AppOpen = { status: 'idle', show: () => {}, retry: () => {} };

/**
 * The SDK's hook, or a stand-in when the SDK is absent (Expo Go). Chosen once,
 * at module load, so the same hook runs on every render.
 */
const ads = nativeAds;
const useAppOpen: (options: {
  adUnitId: string | null;
  requestOptions: { requestNonPersonalizedAdsOnly: boolean };
}) => AppOpen = ads ? (options) => ads.useAppOpenAd(options) : () => NO_APP_OPEN;

export type AppOpenAdControllerProps = {
  /**
   * Whether to show one as the app opens. The caller passes true only when
   * onboarding was already finished before this launch: someone who has just
   * installed the app sees the welcome screen and the tour, then the app —
   * never an advert straight after them.
   */
  showOnLaunch: boolean;
};

/**
 * The free plan's app-open ad: shown as the app opens, and whenever someone
 * comes back to it.
 *
 * Renders nothing. Mounted once, beside the navigator, and only after
 * onboarding.
 *
 * On launch it gets a short window (`AD_PACING.appOpenLaunchWaitMs`) to
 * arrive; an ad that loads later than that would land on a screen already in
 * use, so it is kept for the next return instead. On a return it shows after
 * any real time away (`AD_PACING.appOpenMinAwayMs`), but never on the way
 * back from another ad, never within `AD_PACING.minGapMs` of the last one,
 * and never on top of the Pro screen.
 */
export function AppOpenAdController({ showOnLaunch }: AppOpenAdControllerProps): null {
  const router = useRouter();
  const pathname = usePathname();
  const { has, loaded } = useEntitlements();
  const eligible = loaded && !has('adFree');

  const { status, show, retry } = useAppOpen({
    // `null` stops a Pro account's device from ever requesting one.
    adUnitId: eligible ? unitFor('appOpen') : null,
    requestOptions: { requestNonPersonalizedAdsOnly: true },
  });

  /** When the ad in hand finished loading, to tell a stale one apart. */
  const loadedAt = useRef(0);
  useEffect(() => {
    if (status === 'loaded') loadedAt.current = Date.now();
  }, [status]);

  // The same upkeep as the interstitial: load the next one as soon as this
  // one is dismissed — leading on to the Pro screen every few ads — and wait
  // before asking again after a failure.
  useEffect(() => {
    if (status === 'closed') {
      retry();
      if (noteFullScreenAdClosed()) router.push(UPGRADE_ROUTE);
      return undefined;
    }
    if (status !== 'error' && status !== 'no-fill') return undefined;

    const timer = setTimeout(retry, AD_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, retry, router]);

  /**
   * The launch ad: the first one to load, if it loads in time.
   *
   * Settled exactly once either way, so a late ad is never shown as a launch
   * ad — it waits for the next return like any other.
   */
  const mountedAt = useRef(0);
  const launchSettled = useRef(!showOnLaunch);
  // Declared before the check below, so it has run by the time that does.
  useEffect(() => {
    mountedAt.current = Date.now();
  }, []);
  useEffect(() => {
    if (launchSettled.current || !eligible || status !== 'loaded') return;
    launchSettled.current = true;

    const inTime = Date.now() - mountedAt.current <= AD_PACING.appOpenLaunchWaitMs;
    if (!inTime || AppState.currentState !== 'active' || pathname === UPGRADE_ROUTE) return;

    noteFullScreenAdShown();
    show();
  }, [eligible, status, show, pathname]);

  /**
   * The latest answers, for a listener subscribed once. Updated in an effect
   * rather than during render, so a discarded render cannot leave it torn.
   */
  const latest = useRef({ eligible, status, show, retry, pathname });
  useEffect(() => {
    latest.current = { eligible, status, show, retry, pathname };
  });

  useEffect(() => {
    let current = AppState.currentState;
    let awaySince = 0;

    const subscription = AppState.addEventListener('change', (next) => {
      if (current === 'active' && next !== 'active') awaySince = Date.now();

      if (current !== 'active' && next === 'active') {
        // Read on every return, so the flag only ever answers for this one.
        const returningFromAd = takeReturningFromAd();
        const ad = latest.current;

        const due =
          ad.eligible &&
          ad.status === 'loaded' &&
          !returningFromAd &&
          ad.pathname !== UPGRADE_ROUTE &&
          Date.now() - awaySince >= AD_PACING.appOpenMinAwayMs &&
          fullScreenAdSpacingElapsed();

        if (due) {
          if (Date.now() - loadedAt.current > MAX_AD_AGE_MS) {
            ad.retry();
          } else {
            noteFullScreenAdShown();
            ad.show();
          }
        }
      }

      current = next;
    });

    return () => subscription.remove();
  }, []);

  return null;
}
