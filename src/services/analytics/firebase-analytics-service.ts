import type * as FirebaseAnalyticsModule from '@react-native-firebase/analytics';
import { TurboModuleRegistry } from 'react-native';

import { createLogger } from '@/utils';

import { noopAnalyticsService, type AnalyticsService } from './analytics-service';

const log = createLogger('analytics');

type FirebaseAnalytics = typeof FirebaseAnalyticsModule;

/**
 * The Firebase SDK, or null where the native module is absent (Expo Go).
 *
 * The package resolves its native module the moment it is used and throws
 * when it is missing, so it is required only after the non-throwing registry
 * lookup has found it — the same pattern the ads SDK uses. The type import
 * above is erased at build time and loads nothing.
 *
 * The only file in the app that imports Firebase.
 */
// Optional chaining: some environments (tests, the web) have no registry at all,
// which is the same answer as a missing module.
const firebase: FirebaseAnalytics | null = TurboModuleRegistry?.get?.('NativeRNFBTurboAnalytics')
  ? // A conditional require is the point: an `import` would always run.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    (require('@react-native-firebase/analytics') as FirebaseAnalytics)
  : null;

export function createFirebaseAnalyticsService(): AnalyticsService {
  if (!firebase) return noopAnalyticsService;
  const sdk = firebase;
  const analytics = sdk.getAnalytics();

  /** Never lets an analytics failure reach the caller. */
  const quietly = (task: () => unknown) => {
    try {
      const pending = task();
      if (pending instanceof Promise) {
        pending.catch((cause: unknown) => log.warn('analytics call failed', cause));
      }
    } catch (cause) {
      log.warn('analytics call failed', cause);
    }
  };

  return {
    id: 'analytics.firebase',

    async isAvailable() {
      return true;
    },

    log(event) {
      quietly(() =>
        sdk.logEvent(analytics, event.name, 'params' in event ? event.params : undefined),
      );
    },

    screen(name) {
      quietly(() => sdk.logScreenView(analytics, { screen_name: name, screen_class: name }));
    },

    setUserProperty(property) {
      quietly(() => sdk.setUserProperty(analytics, property.name, property.value));
    },
  };
}
