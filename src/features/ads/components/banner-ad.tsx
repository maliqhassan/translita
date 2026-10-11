import { Component, useState, type ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/hooks';
import { useEntitlements } from '@/store';

import { unitFor } from '../ad-units';
import { nativeAds } from '../native-ads';

/**
 * The free plan's banner, pinned directly above the tab bar.
 *
 * It sits in the tab bar's own slot rather than inside any screen, which is
 * what keeps it out of every scroll view in the app: it cannot be pushed into
 * the composer, cannot land on top of a result, and cannot move when content
 * above it grows. The one place a persistent advert is safe is the one place
 * no screen owns.
 *
 * Requests the real banner unit in a release build and Google's test unit in
 * development — `unitFor` decides, for every format at once. Removing it is
 * deleting this file and one line of the tabs layout.
 */

/** The banner's height once an ad has arrived. Nothing is reserved before. */
const BANNER_HEIGHT = 50;

/**
 * Keeps an ad failure inside the ad.
 *
 * `onAdFailedToLoad` covers a request that came back empty, which is the
 * common case and not an error worth showing anyone. It does not cover the
 * native view being absent — in a bundle built without the native module,
 * mounting one throws — and an uncaught throw here would now take down the
 * tab bar, and with it every screen. React only contains that with a
 * boundary.
 */
class AdBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function PlanBannerAd() {
  const theme = useTheme();
  const { has, loaded } = useEntitlements();

  /**
   * Whether an ad has arrived to fill the slot.
   *
   * The slot used to hold its 50 points open from the start, so a free user
   * saw an empty strip above the tab bar whenever no ad had loaded — for the
   * first seconds of every visit, and for good on a no-fill. It now opens only
   * when there is something in it. Once open it stays open: AdMob refreshes
   * the banner on its own, about once a minute, and a refresh that comes back
   * empty leaves the previous ad showing rather than a hole.
   *
   * There is deliberately no close button. A control sitting against an ad is
   * exactly what AdMob flags as encouraging accidental clicks; Translita Pro
   * is the way to remove it.
   */
  const [filled, setFilled] = useState(false);

  /*
   * The only commercial question the banner asks.
   *
   * Asked as a capability, never as `plan === 'pro'`, so the day the plan is
   * issued by a receipt instead of a local file this call site does not
   * change.
   *
   * Nothing renders until entitlements have loaded. That is the cautious
   * direction for one frame: showing an advert to somebody who has just paid
   * to remove them is the failure that would actually annoy a user.
   */
  if (!loaded || has('adFree')) return null;

  // A build without the SDK (Expo Go) has nothing to show and reserves no slot.
  if (!nativeAds) return null;
  const { BannerAd, BannerAdSize } = nativeAds;
  const unitId = unitFor('banner');
  if (!unitId) return null;

  return (
    <AdBoundary>
      {/* The library does not forward standard View props, so positioning
          belongs to a wrapper. The background matches the tab bar's own
          surface, so an empty slot reads as part of the chrome rather than
          as a hole. */}
      {/*
       * The ad's own slot: no height until an ad loads, then a fixed box
       * clipped hard.
       *
       * The navigator lays this out in the normal flow, between the screen
       * and the tab bar — but the banner is a *native* view, and on Android it
       * can draw at its own size and position regardless of its React parent.
       * That is how a test ad ended up covering the Translate button in the
       * middle of the screen. A fixed box with `overflow: 'hidden'` (which on
       * Android clips native children) and `collapsable={false}` (so the box
       * is a real view the banner is parented to, not flattened away) keeps
       * whatever the SDK draws inside these 50 points — or inside none, while
       * the request is still out.
       */}
      <View
        collapsable={false}
        style={{
          width: '100%',
          height: filled ? BANNER_HEIGHT : 0,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <BannerAd
          // Real in a release build, Google's test unit in development.
          unitId={unitId}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          onAdLoaded={() => setFilled(true)}
          // Deliberately silent. A no-fill is an ordinary outcome — a new ad
          // unit fills slowly for its first days — and it is not a reason to
          // show anything or to log what the user was doing.
          onAdFailedToLoad={() => {}}
        />
      </View>
    </AdBoundary>
  );
}
