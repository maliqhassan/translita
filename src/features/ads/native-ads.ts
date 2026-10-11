import { TurboModuleRegistry } from 'react-native';
import type * as GoogleMobileAdsModule from 'react-native-google-mobile-ads';

type GoogleMobileAds = typeof GoogleMobileAdsModule;

/**
 * The Google Mobile Ads SDK, or null in a build that does not contain it.
 *
 * The package's own entry calls `TurboModuleRegistry.getEnforcing` as soon as
 * it is imported, which throws wherever the native module is absent — Expo Go
 * in particular — and took the whole app down at startup. Asked first with the
 * non-throwing `get`, and only then required, a build without the SDK simply
 * shows no ads, which is also what a Pro account sees.
 *
 * The one place the SDK is loaded; the banner and the interstitial both go
 * through this. The type import above is erased at build time, so it cannot
 * load the package.
 */
export const nativeAds: GoogleMobileAds | null = TurboModuleRegistry.get('RNGoogleMobileAdsModule')
  ? // A conditional require is the point: an `import` would always run.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('react-native-google-mobile-ads') as GoogleMobileAds)
  : null;
