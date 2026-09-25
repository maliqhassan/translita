import { FEATURES, REVENUECAT, STORAGE_KEYS, TRANSLATION_CONFIG } from '@/constants';
import { createExpoSQLiteDatabase, createHistoryRepository } from '@/database';
import { TranseeMlKit, TranseeOcr } from '@modules/transee-mlkit';

import { expoClipboardService } from './clipboard';
import {
  createLocalEntitlementsService,
  createRevenueCatEntitlementsService,
  createRevenueCatPurchaseService,
  type DevelopmentEntitlementsService,
  type EntitlementsService,
  type PurchaseService,
} from './entitlements';
import { createFetchHttpClient } from './http';
import { expoNetworkService } from './network';
import { createMlKitOcrService } from './ocr';
import {
  createFilePreferencesStorage,
  createPreferencesService,
  getActiveTranslationMode,
} from './preferences';
import { expoSpeechRecognitionService, expoTTSService } from './speech';
import {
  createBackendTranslationProvider,
  createInFlightRegistry,
  createMemoryTranslationCache,
  createNullTranslationCache,
  createMlKitOfflineEngine,
  createOfflineTranslationService,
  createOnlineTranslationService,
  createTranslationRouter,
  mockTranslationService,
  offlineTranslationPermitted,
  unconfiguredOnlineTranslationService,
  withCache,
  type TranslationService,
} from './translation';
import { createBackendTutorService } from './tutor';

/**
 * Single place where concrete services are bound to their interfaces.
 *
 * Features import `services` (never a concrete module), which keeps screens
 * decoupled from engines and makes swapping a real implementation for a
 * placeholder — or a test double — a one-line change.
 */

const http = createFetchHttpClient({ defaultTimeoutMs: TRANSLATION_CONFIG.timeoutMs });

const backendProvider = createBackendTranslationProvider({
  baseUrl: TRANSLATION_CONFIG.backend.baseUrl,
  translatePath: TRANSLATION_CONFIG.backend.translatePath,
  http,
});

/**
 * The online engine is only built when a backend URL exists. Without one it
 * stays an inert stand-in, so a build with no backend can never fire a request
 * at a URL that is not there.
 */
const onlineTranslationService: TranslationService = backendProvider.isConfigured()
  ? createOnlineTranslationService({
      provider: backendProvider,
      network: expoNetworkService,
      retry: TRANSLATION_CONFIG.retry,
    })
  : unconfiguredOnlineTranslationService;

/**
 * The on-device engine.
 *
 * `TranseeMlKit` is null unless the native module was compiled into this build,
 * so a JS-only bundle or Expo Go gets an engine that reports itself unavailable
 * rather than one that throws. Nothing else in the app changes either way.
 */
const offlineRuntime = createMlKitOfflineEngine({ native: TranseeMlKit });

const offlineEngine = createOfflineTranslationService(offlineRuntime);

/**
 * Text recognition. Null native module means a build without the scanner, and
 * the service reports itself unavailable rather than throwing.
 */
const ocrRecognizer = createMlKitOcrService({ native: TranseeOcr });

/**
 * Candidate engines.
 *
 * Both real engines are always candidates. They previously were not: with no
 * `EXPO_PUBLIC_TRANSEE_API_URL` the list was replaced wholesale by the sample
 * engine, which quietly removed the on-device engine from routing. A user
 * could then download language packs, select "on-device only", and receive a
 * sample translation — the offline engine was never even asked.
 *
 * Whether an engine can actually run is each engine's own business:
 * `unconfiguredOnlineTranslationService` reports unavailable without a backend
 * URL, and the ML Kit engine reports unavailable without a native build. Being
 * a candidate is not a claim that it works; it is what lets it answer.
 *
 * The sample engine is now opt-in only. `FEATURES.mockTranslation` is the sole
 * thing that admits it, so a missing backend can no longer turn a development
 * stand-in into the production engine. `orderEngines` also ranks it behind
 * every real engine, and it is eligible only in `auto`.
 */
const translationEngines: readonly TranslationService[] = [
  onlineTranslationService,
  offlineEngine,
  ...(FEATURES.mockTranslation ? [mockTranslationService] : []),
];

const translationCache = TRANSLATION_CONFIG.cache.enabled
  ? createMemoryTranslationCache({ maxEntries: TRANSLATION_CONFIG.cache.maxEntries })
  : createNullTranslationCache();

/**
 * The same entitlement question asked in both places it can be bypassed.
 *
 * The routing policy decides whether the on-device engine may run; the cache
 * decides whether a result it already produced may still be handed back. One
 * helper answers both, so the two can never disagree — and neither is a
 * filter over `translationEngines` above, which stays whole. Filtering the
 * candidate list here would freeze the answer at import time, which is exactly
 * the stale state a lapsed subscription would exploit.
 */
const translationRouter = withCache(
  createTranslationRouter({
    engines: translationEngines,
    network: expoNetworkService,
    // Read per request, so changing the setting takes effect immediately.
    mode: getActiveTranslationMode,
    offlineEntitled: offlineTranslationPermitted,
  }),
  {
    cache: translationCache,
    inFlight: createInFlightRegistry(),
    offlineEntitled: offlineTranslationPermitted,
  },
);

/**
 * Local persistence. The database driver is bound here like any other
 * implementation, so features depend on `HistoryRepository` and never on
 * expo-sqlite.
 */
const historyRepository = createHistoryRepository(createExpoSQLiteDatabase());

/**
 * Entitlements, over the same one-slot storage seam preferences use.
 *
 * Two bindings on purpose. `entitlementsService` is typed as the base
 * contract, so nothing reached through `services` can change the plan — that
 * is what a billing-backed implementation will look like. The development
 * implementation is exported separately below.
 */
const localEntitlements = createLocalEntitlementsService(
  createFilePreferencesStorage(`${STORAGE_KEYS.entitlements}.json`),
);

/**
 * The plan, from the store rather than from a file on the device.
 *
 * The swap the contract was shaped for. `EntitlementsService` has no setter,
 * so binding this in place of the local implementation changes nothing above
 * the registry — and makes any accidental client-side plan change a compile
 * error rather than a silent free upgrade.
 *
 * The local implementation stays bound behind `developmentEntitlements`, which
 * is `undefined` in a release build. That is what lets the plan switcher keep
 * working for testing without it ever shipping.
 */
const revenueCat = {
  apiKey: REVENUECAT.publicKey,
  debug: __DEV__,
} as const;

const entitlementsService: EntitlementsService = createRevenueCatEntitlementsService(revenueCat);

/**
 * Selling the plan, which is a different job from reading it.
 *
 * Bound from the same options as the entitlements service so both talk to one
 * configured SDK. Kept a separate service because the read side must stay
 * unable to grant anything: this one can open the store's sheet, and still
 * cannot change a plan — only a validated receipt reaching RevenueCat does
 * that, and it arrives on the entitlements listener.
 */
const purchaseService: PurchaseService = createRevenueCatPurchaseService(revenueCat);

/**
 * The plan switcher's only door, and only in a development build.
 *
 * `__DEV__` is a compile-time constant, so a release bundle keeps the
 * `undefined` branch and drops the switcher UI that depends on it. When real
 * billing arrives this export goes, and any caller that survived becomes a
 * compile error rather than a silent free upgrade.
 */
export const developmentEntitlements: DevelopmentEntitlementsService | undefined = __DEV__
  ? localEntitlements
  : undefined;

export const services = {
  translation: {
    /** What the UI calls. It never picks an engine itself. */
    router: translationRouter,
    online: onlineTranslationService,
    offline: offlineEngine,
    /** Exposed so settings can offer a "clear cached translations" action. */
    cache: translationCache,
  },
  /** Persistent translation history. Call `initialize()` before querying. */
  history: historyRepository,
  /** Device-local user settings. */
  preferences: createPreferencesService(createFilePreferencesStorage()),
  /**
   * What the user's plan entitles them to.
   *
   * Deliberately the read-only contract: features ask `has(capability)` and
   * cannot change anything.
   */
  entitlements: entitlementsService,
  /**
   * Buying Pro.
   *
   * Separate from `entitlements` on purpose: this can ask for money, and
   * cannot hand out a plan.
   */
  purchases: purchaseService,
  /**
   * Conversational language practice.
   *
   * Reports itself unavailable in a build with no backend URL, exactly as the
   * online engine does, so the screen can hide practice rather than offer
   * something that cannot answer. The model credential is on the server.
   */
  tutor: createBackendTutorService({
    baseUrl: TRANSLATION_CONFIG.backend.baseUrl,
    path: TRANSLATION_CONFIG.backend.tutorPath,
    http,
  }),
  network: expoNetworkService,
  clipboard: expoClipboardService,
  ocr: ocrRecognizer,
  speech: expoSpeechRecognitionService,
  tts: expoTTSService,
  /**
   * The on-device model runtime, for the language packs screen.
   *
   * This is the engine rather than the `TranslationService` wrapper, because
   * managing models is not translating: the screen needs `listModels`,
   * `downloadModel` and `deleteModel`, none of which the router's view
   * exposes. It stays behind `OfflineTranslationEngine`, so the screen still
   * knows nothing about ML Kit.
   */
  offlineModels: offlineRuntime,
} as const;

export type Services = typeof services;
