import { AD_PACING } from '@/constants';

/**
 * What the full-screen ads need to know about each other.
 *
 * A full-screen ad is its own Android activity, so showing one sends the app
 * to the background, and closing it brings the app back. To the app-open ad,
 * that return looks exactly like the user coming back to the app — the
 * moment it is meant for. Without this, dismissing an interstitial could open
 * an app-open ad straight on top of it.
 *
 * It is also the one place the spacing between ads, and the count behind the
 * Pro prompt, are kept — the interstitials and the app-open ad all share it.
 *
 * Module state rather than React state on purpose: it is read inside an
 * AppState listener, and it has to be right in the same tick it was set.
 */

let returningFromAd = false;
let lastShownAt = 0;
let closedCount = 0;

/** Called just before any full-screen ad is shown. */
export function noteFullScreenAdShown(): void {
  returningFromAd = true;
  lastShownAt = Date.now();
}

/**
 * Whether this return to the app is the end of an ad rather than the user
 * coming back. Reading it clears it, so it answers for one return only.
 */
export function takeReturningFromAd(): boolean {
  const answer = returningFromAd;
  returningFromAd = false;
  return answer;
}

/**
 * Whether enough time has passed since the last full-screen ad of any kind.
 * Back-to-back ads are the one thing AdMob singles out, whatever the placement.
 */
export function fullScreenAdSpacingElapsed(): boolean {
  return Date.now() - lastShownAt >= AD_PACING.minGapMs;
}

/**
 * Called once each time a full-screen ad is dismissed. True when this one
 * should be followed by the Pro screen — the moment the cost of the free plan
 * is most obvious is the moment to say what removes it.
 */
export function noteFullScreenAdClosed(): boolean {
  closedCount += 1;
  return closedCount % AD_PACING.adsPerUpgradePrompt === 0;
}
