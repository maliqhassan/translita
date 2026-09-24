import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';

import { useTheme } from '@/hooks';
import { useEntitlements } from '@/store';

/**
 * The free plan's banner, pinned directly above the tab bar.
 *
 * It sits in the tab bar's own slot rather than inside any screen, which is
 * what keeps it out of every scroll view in the app: it cannot be pushed into
 * the composer, cannot land on top of a result, and cannot move when content
 * above it grows. The one place a persistent advert is safe is the one place
 * no screen owns.
 *
 * **Still the spike's test unit.** No real ad unit, no consent flow and no
 * `AdsService` yet — see the roadmap. Removing it is deleting this file and
 * one line of the tabs layout.
 */

/** Reserved height, so an absent advert does not move the tab bar. */
const BANNER_HEIGHT = 50;

/**
 * Keeps an ad failure inside the ad.
 *
 * `onAdFailedToLoad` covers a request that came back empty, which is the
 * common case and not an error worth showing anyone. It does not cover the
 * native view being absent — in a bundle built without the native module,
 * mounting one throws — and an uncaught throw here would now take down the
 * tab bar, and with it every screen. React only contains that with a
 * boundary, so this is the one piece of machinery the spike does not skip.
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

  /*
   * The only commercial question asked anywhere in this spike.
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

  return (
    <AdBoundary>
      {/* The library does not forward standard View props, so positioning
          belongs to a wrapper. The background matches the tab bar's own
          surface, so an empty slot reads as part of the chrome rather than
          as a hole. */}
      <View
        style={{
          height: BANNER_HEIGHT,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.background,
        }}
      >
        <BannerAd
          // The package's own constant rather than a literal, so the id
          // cannot drift from the version installed. It resolves to Google's
          // official test unit and is never a real one.
          unitId={TestIds.BANNER}
          size={BannerAdSize.BANNER}
          requestOptions={{ requestNonPersonalizedAdsOnly: true }}
          // Deliberately silent. A no-fill is the expected outcome of a test
          // unit on a device with no advertising identity, and it is not a
          // reason to show anything or to log what the user was doing.
          onAdFailedToLoad={() => {}}
        />
      </View>
    </AdBoundary>
  );
}
