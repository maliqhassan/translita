/** App-wide constants. Anything tweakable without a code review lives here. */
export const APP = {
  name: 'Transee',
  tagline: 'Translate anywhere, online or off',
  version: '0.2.0',
} as const;

/** Keys for persisted values. Namespaced so a stray key can never collide. */
export const STORAGE_KEYS = {
  preferences: 'transee.preferences.v1',
  languageSelection: 'transee.languages.v1',
  /**
   * The user's plan. Its own slot rather than a preference: a preference is
   * something the user chooses, and this will stop being one the moment it is
   * issued by a server instead of set on the device.
   */
  entitlements: 'transee.entitlements.v1',
} as const;

export const DEFAULTS = {
  sourceLanguage: 'en',
  targetLanguage: 'de',
  /** Debounce before an as-you-type translation would be requested. */
  translateDebounceMs: 450,
  maxInputLength: 5000,
  /** Point at which the character counter starts warning, as a ratio. */
  inputWarningRatio: 0.9,
  historyPageSize: 30,
  /** Recent translations surfaced on the home screen. */
  recentOnHome: 3,
} as const;

/**
 * Feature flags. Days 2–20 flip these on as each capability lands, which keeps
 * half-built features off the UI without branching the codebase.
 */
export const FEATURES = {
  /**
   * Admits the in-memory sample engine as a routing candidate.
   *
   * This is now the **only** thing that admits it. Until Day 16 the registry
   * also swapped the sample engine in whenever no backend URL was configured,
   * which quietly removed the on-device engine from routing and let a sample
   * result answer "on-device only". A missing backend is no longer a reason to
   * use it; turning this on is.
   *
   * Even when on, the sample engine ranks behind every real engine and is
   * eligible only in `auto`, so it can never answer a mode the user chose.
   */
  mockTranslation: false,
  /**
   * On-device translation, over ML Kit. The implementation exists end to end —
   * engine, model registry, language packs and routing — and the native module
   * compiles and is packaged by EAS. It has still not been exercised on
   * hardware, which is why every catalogue entry keeps `offline.supported:
   * false` until a device confirms a model actually translates.
   */
  offlineTranslation: true,
  /**
   * Whether the `offlineTranslation` entitlement is actually *enforced*.
   *
   * Off, and the routing layer behaves exactly as it always has: the on-device
   * engine is a candidate for everyone, on any plan. On, and it is a candidate
   * only for a user entitled to it.
   *
   * Deliberately separate from `offlineTranslation` above, which says whether
   * the capability exists in this build at all. The two are different
   * questions.
   *
   * Built dormant and switched on afterwards, because enforcing it while the
   * on-device engine was the only working path would have left free users
   * unable to translate anything. It was enabled once online translation was
   * deployed and verified on a device.
   *
   * That order is worth keeping in mind before changing anything here: with
   * enforcement on, a free user has no fallback, so online translation being
   * reachable is what keeps the free plan usable at all.
   */
  offlineEntitlement: true,
  /**
   * Scanning text with the camera, over ML Kit's bundled Latin recogniser.
   * Implemented end to end and compiles; no device has pointed a camera at
   * anything yet. Latin script only.
   */
  cameraOcr: true,
  /**
   * Dictation, over the platform speech recogniser. Implemented end to end and
   * compiles, but no device has spoken into it yet — and on most Android
   * phones recognition streams audio to Google rather than running on device.
   */
  speechInput: true,
  textToSpeech: true,
  conversationMode: false,
} as const;

export type FeatureFlag = keyof typeof FEATURES;
