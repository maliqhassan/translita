/** App-wide constants. Anything tweakable without a code review lives here. */
export const APP = {
  name: 'Translita',
  tagline: 'Offline translation app',
  version: '0.2.0',
} as const;

/**
 * Where the app's published legal documents live.
 *
 * Empty because nothing has been published yet, and an empty string is the
 * honest way to say so. It is deliberately not a plausible-looking
 * `https://transee.app/privacy`: a URL that 404s on a store listing is worse
 * than a screen that admits the document is not ready, and a placeholder that
 * looks real is one nobody remembers to replace.
 *
 * The welcome screen reads this and tells the user plainly when it is unset,
 * rather than offering a link that does nothing. Setting it here is the only
 * change needed to make that link live.
 *
 * REQUIRED BEFORE RELEASE: Google Play will not accept the listing without a
 * privacy policy URL, and the app collects nothing but stores translations on
 * the device, which the policy still has to state.
 */
export const LEGAL = {
  privacyPolicyUrl: '',
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

/**
 * How the paid tier is sold.
 *
 * Prices here are the *intended* ones, for a screen that has nothing better
 * to show yet. They are not the source of truth and must not become it: the
 * store returns a localised price per country, and a hard-coded dollar figure
 * shown to somebody in Karachi or Lagos is simply wrong. Once RevenueCat is
 * wired the screen reads its offerings instead and these become fallbacks.
 *
 * The product identifiers are the part that has to be exact — they must match
 * what is created in the Play Console, character for character.
 */
export const PRO_PLANS = {
  monthly: { productId: 'translita_pro_monthly', displayPrice: '$4.99', period: 'month' },
  yearly: { productId: 'translita_pro_yearly', displayPrice: '$29.99', period: 'year' },
  /** Shown beside the yearly option. Derived, so it cannot contradict itself. */
  yearlySavingPercent: 50,
} as const;

/**
 * Free AI practice exchanges, before Pro is required.
 *
 * Small on purpose. Each one is a billed model call, and the allowance exists
 * so somebody can find out whether they like practising — not to be a usable
 * free tier.
 */
export const AI_TRIAL_TURNS = 10;

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
   * Dormant again, and this time as the settled product position rather than
   * as a staging step. Both plans hold `offlineTranslation`, so enforcement
   * would grant it to everyone anyway — but leaving the flag on would make
   * free users' on-device translation depend on the capability table staying
   * exactly right, and an accidental edit there would silently take the
   * feature away. Off, nothing but this line can.
   *
   * It is not the switch that turns on-device translation off. That is
   * `offlineTranslation` above, which decides whether the capability exists in
   * this build at all; this one only decides whether the entitlement is
   * consulted. The two are different questions and are kept apart on purpose.
   *
   * The machinery behind it — the routing gate, the cache guard and the
   * in-flight guard — is deliberately still wired up. Turning this back on and
   * moving `offlineTranslation` out of the free list is all that a future
   * re-tiering would take.
   */
  offlineEntitlement: false,
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
  /**
   * Two-sided spoken conversation, on its own screen.
   *
   * Built once there was a specification to build from. It composes the
   * recogniser, the router and the speech engine that already exist rather
   * than adding a capability, which is why it needs no device work of its own
   * beyond what dictation already required.
   */
  conversationMode: true,
} as const;

export type FeatureFlag = keyof typeof FEATURES;
