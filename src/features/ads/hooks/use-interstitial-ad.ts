import { usePathname, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { AD_PACING } from '@/constants';
import { useEntitlements } from '@/store';

import { AD_RETRY_DELAY_MS, unitFor } from '../ad-units';
import {
  fullScreenAdSpacingElapsed,
  noteFullScreenAdClosed,
  noteFullScreenAdShown,
} from '../full-screen-ads';
import { nativeAds } from '../native-ads';

type InterstitialOptions = {
  adUnitId: string | null;
  requestOptions: { requestNonPersonalizedAdsOnly: boolean };
};

type Interstitial = { status: string; show: () => void; retry: () => void };

/** What a build without the ads SDK gets: an ad that never loads. */
const NO_INTERSTITIAL: Interstitial = { status: 'idle', show: () => {}, retry: () => {} };

/**
 * The SDK's hook, or a stand-in when the SDK is absent (Expo Go).
 *
 * Chosen once, at module load, so the same hook runs on every render — the
 * rules of hooks hold because the choice never changes during a session.
 */
const ads = nativeAds;
const useInterstitial: (options: InterstitialOptions) => Interstitial = ads
  ? (options) => ads.useInterstitialAd(options)
  : () => NO_INTERSTITIAL;

/**
 * How long a shown ad has to start before whatever was waiting on it goes
 * ahead anyway. An ad that fails to open reports nothing at all, and the
 * user's tap must never simply vanish.
 */
const AD_START_TIMEOUT_MS = 1_500;

type FreeInterstitial = {
  /** Shows the ad if one is ready and due, and reports whether it did. */
  showIfReady: () => boolean;
  /**
   * Shows the ad if one is ready and due, then runs `action` once it is
   * closed; with no ad to show, runs it at once.
   */
  showThen: (action: () => void) => void;
};

/**
 * One free-plan interstitial, kept loaded, and the only place that asks
 * whether it may run at all.
 *
 * A Pro account, an ad still loading, an ad shown too recently and one that
 * failed to fill all look the same from outside — nothing shows, and anything
 * waiting on the ad goes ahead — which is what keeps `has('adFree')` out of
 * every screen that shows one.
 *
 * `null` for the ad unit — rather than passing the real one and checking
 * eligibility only before calling `show` — is what stops a Pro account's
 * device from ever requesting an ad in the first place.
 */
function useFreeInterstitial(): FreeInterstitial {
  const router = useRouter();
  const pathname = usePathname();
  const { has, loaded } = useEntitlements();
  const eligible = loaded && !has('adFree');

  const { status, show, retry } = useInterstitial({
    adUnitId: eligible ? unitFor('interstitial') : null,
    requestOptions: { requestNonPersonalizedAdsOnly: true },
  });

  /** What to open once the ad on screen is closed. */
  const pending = useRef<(() => void) | undefined>(undefined);
  /** The latest status, for the start timeout, which outlives a render. */
  const statusNow = useRef(status);
  useEffect(() => {
    statusNow.current = status;
  }, [status]);

  const runPending = useCallback(() => {
    const action = pending.current;
    pending.current = undefined;
    action?.();
  }, []);

  /**
   * Keeps the next ad coming. The SDK loads once and then stops: after an ad
   * is dismissed, or a request comes back empty, nothing loads again unless
   * asked.
   *
   * Without the first branch only one interstitial could ever show per visit
   * to a screen. It is also where the thing the user tapped finally opens,
   * and where every few dismissed ads lead on to the Pro screen — unless
   * something was waiting to open, which takes priority over a second
   * interruption. The second branch waits before asking again, because asking
   * at once on a phone with no connection becomes a loop of requests.
   */
  useEffect(() => {
    if (status === 'closed') {
      retry();
      const promptUpgrade = noteFullScreenAdClosed();
      if (pending.current) runPending();
      // Never a second Pro screen on top of one already open.
      else if (promptUpgrade && pathname !== '/upgrade') router.push('/upgrade');
      return undefined;
    }
    if (status !== 'error' && status !== 'no-fill') return undefined;

    // An ad that failed on its way to the screen must not strand the tap.
    runPending();
    const timer = setTimeout(retry, AD_RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [status, retry, router, runPending, pathname]);

  const showIfReady = useCallback(() => {
    // Not ready is not a failure worth surfacing: whatever the user asked
    // for is already on its way, and a missing ad is the app's problem.
    if (!eligible || status !== 'loaded' || !fullScreenAdSpacingElapsed()) return false;

    noteFullScreenAdShown('interstitial');
    show();
    return true;
  }, [eligible, status, show]);

  const showThen = useCallback(
    (action: () => void) => {
      if (!showIfReady()) {
        action();
        return;
      }
      pending.current = action;
      setTimeout(() => {
        if (pending.current === action && statusNow.current !== 'showing') runPending();
      }, AD_START_TIMEOUT_MS);
    },
    [showIfReady, runPending],
  );

  return { showIfReady, showThen };
}

/**
 * The Conversation screen's full-screen ad.
 *
 * The screen counts replies itself (every `CONVERSATION_AD_INTERVAL`) and
 * calls this when one is due. It gets back a single function and nothing
 * else — no status, no ad unit, no entitlement.
 */
export function useConversationInterstitialAd(): () => void {
  const { showIfReady } = useFreeInterstitial();
  return useCallback(() => {
    showIfReady();
  }, [showIfReady]);
}

export type InterstitialAds = {
  /**
   * Called on every press of Translate. Every
   * `AD_PACING.translationsPerInterstitial`th press shows an ad as the request
   * goes out: it covers the wait, and closing it reveals the result. When no
   * ad is ready, the count is kept rather than reset, so the very next press
   * tries again instead of starting over.
   */
  onTranslate: () => void;
  /**
   * Opens a feature — Conversation, the camera scanner — after an ad, when
   * one is ready and due. Closing the ad opens it; with no ad, it opens at
   * once, so the tap always does what it says.
   */
  openAfterAd: (open: () => void) => void;
};

/**
 * A screen's full-screen ads: one interstitial, kept loaded, shared by every
 * place on the screen that shows one. Spacing between ads of any kind is
 * `AD_PACING.minGapMs`, enforced where the ad is shown.
 */
export function useInterstitialAds(): InterstitialAds {
  const { showIfReady, showThen } = useFreeInterstitial();
  const presses = useRef(0);

  const onTranslate = useCallback(() => {
    presses.current += 1;
    if (presses.current < AD_PACING.translationsPerInterstitial) return;
    if (showIfReady()) presses.current = 0;
  }, [showIfReady]);

  return useMemo(() => ({ onTranslate, openAfterAd: showThen }), [onTranslate, showThen]);
}
