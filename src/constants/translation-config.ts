/**
 * Client-safe configuration for the translation stack.
 *
 * SECURITY: everything in this file ships inside the app bundle and must be
 * treated as public. A private provider key (Google, DeepL, Microsoft) must
 * never appear here, in `app.json`, or in any `EXPO_PUBLIC_*` variable — those
 * are inlined into the bundle at build time and are trivially readable.
 *
 * The intended topology keeps the secret off the device entirely:
 *
 *     app  ->  Translita backend  ->  translation provider
 *              (holds the key)
 *
 * The app knows only the backend's public URL.
 */

/**
 * Public base URL of the Translita backend, e.g. `https://api.transee.app`.
 *
 * Read from `EXPO_PUBLIC_TRANSEE_API_URL`, which Expo inlines at build time.
 * Undefined until a backend exists, which is what keeps the online engine
 * reporting itself unavailable instead of calling a URL that is not there.
 */
const backendUrl = process.env.EXPO_PUBLIC_TRANSEE_API_URL;

export const TRANSLATION_CONFIG = {
  backend: {
    /** Undefined means "no backend configured"; the online engine stays off. */
    baseUrl: backendUrl,
    /** Path appended to `baseUrl` for a translation. */
    translatePath: '/translation',
    /**
     * Path for conversational language practice.
     *
     * Same host, same build-time URL: the model credential lives beside the
     * translation one on the server, and neither is ever in this app.
     */
    tutorPath: '/tutor',
  },

  /** Abort a request that has not answered in this long. */
  timeoutMs: 10_000,

  retry: {
    /** Total attempts including the first. 1 disables retrying. */
    maxAttempts: 3,
    /** First backoff step; doubles per attempt up to `maxDelayMs`. */
    baseDelayMs: 400,
    maxDelayMs: 2_000,
  },

  cache: {
    enabled: true,
    /** Least-recently-used entries are dropped past this count. */
    maxEntries: 100,
  },
} as const;

export type TranslationConfig = typeof TRANSLATION_CONFIG;

/** Whether a backend URL has been configured for this build. */
export function hasBackendConfigured(): boolean {
  return typeof backendUrl === 'string' && backendUrl.length > 0;
}
