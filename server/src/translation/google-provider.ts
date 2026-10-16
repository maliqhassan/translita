import { apiError, fail, ok, type Result } from '../http/api-error';

import type { ProviderRequest, ProviderResult, TranslationProvider } from './provider';

/**
 * Google Cloud Translation, Basic (v2), with an API key.
 *
 * A second provider behind the same interface, so translation can switch
 * between Azure and Google with one setting (`TRANSLATION_PROVIDER`) and no
 * app change. The shared language map speaks Azure's codes; the few Google
 * spells differently are translated here, both ways.
 *
 * The key is sent only to Google, as a query parameter of the request, and is
 * never logged, echoed or included in any response this module produces.
 *
 * Reference: https://cloud.google.com/translate/docs/reference/rest/v2/translate
 */

const ENDPOINT = 'https://translation.googleapis.com/language/translate/v2';

/** Azure's spelling → Google's, for the codes that differ. */
const TO_GOOGLE: Readonly<Record<string, string>> = {
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  fil: 'tl',
  'mn-Cyrl': 'mn',
  'sr-Cyrl': 'sr',
  nb: 'no',
};

/** Google's spelling → Azure's, for a detected source language. */
const FROM_GOOGLE: Readonly<Record<string, string>> = {
  ...Object.fromEntries(Object.entries(TO_GOOGLE).map(([azure, google]) => [google, azure])),
  zh: 'zh-Hans',
  iw: 'he',
};

export const toGoogleCode = (code: string): string => TO_GOOGLE[code] ?? code;
export const fromGoogleCode = (code: string): string => FROM_GOOGLE[code] ?? code;

export type GoogleProviderOptions = {
  apiKey?: string;
  timeoutMs: number;
  endpoint?: string;
  /** Injectable so tests drive the adapter without a network or credential. */
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Validates Google's payload before any of it is trusted. */
export function adaptGoogleResponse(payload: unknown): Result<ProviderResult> {
  const data = isRecord(payload) ? payload.data : undefined;
  const translations = isRecord(data) ? data.translations : undefined;
  if (!Array.isArray(translations) || translations.length === 0) {
    return fail(apiError('provider_error', 'Translation provider returned no translations.'));
  }
  const first: unknown = translations[0];
  if (!isRecord(first)) {
    return fail(apiError('provider_error', 'Translation provider returned an unexpected result.'));
  }
  const text = first.translatedText;
  if (typeof text !== 'string' || text.length === 0) {
    return fail(apiError('provider_error', 'Translation provider returned empty text.'));
  }
  const detected = first.detectedSourceLanguage;
  return ok({
    translatedText: text,
    detectedCode:
      typeof detected === 'string' && detected.length > 0 ? fromGoogleCode(detected) : undefined,
  });
}

/** Maps Google's HTTP status onto our own vocabulary. */
export function adaptGoogleStatus(status: number): Result<never> {
  if (status === 429) {
    return fail(
      apiError('rate_limited', 'Translation is busy right now. Please try again shortly.'),
    );
  }
  if (status === 400) {
    return fail(apiError('unsupported_language', 'That language pair is not available.'));
  }
  if (status === 401 || status === 403 || status >= 500 || status === 408) {
    // A key, billing or quota problem is ours, not the caller's: never say which.
    return fail(apiError('provider_unavailable', 'Translation is temporarily unavailable.'));
  }
  return fail(apiError('provider_error', 'Translation failed.'));
}

export function createGoogleProvider(options: GoogleProviderOptions): TranslationProvider {
  const doFetch = options.fetchImpl ?? fetch;
  const endpoint = options.endpoint ?? ENDPOINT;

  return {
    name: 'google-translate',

    isConfigured() {
      return typeof options.apiKey === 'string' && options.apiKey.length > 0;
    },

    async translate(request: ProviderRequest): Promise<Result<ProviderResult>> {
      if (!options.apiKey) {
        return fail(apiError('provider_unavailable', 'Translation is not configured.'));
      }

      const url = new URL(endpoint);
      url.searchParams.set('key', options.apiKey);

      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs);

      try {
        const response = await doFetch(url.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify({
            q: request.text,
            target: toGoogleCode(request.targetCode),
            // Omitting `source` is how Google is asked to detect it.
            ...(request.sourceCode ? { source: toGoogleCode(request.sourceCode) } : {}),
            // Plain text, so the reply carries no HTML entities.
            format: 'text',
          }),
          signal: controller.signal,
        });

        if (!response.ok) return adaptGoogleStatus(response.status);

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          return fail(apiError('provider_error', 'Translation provider returned invalid JSON.'));
        }
        return adaptGoogleResponse(payload);
      } catch {
        // The cause is not forwarded: it can carry the request URL, and that
        // holds the key.
        return fail(
          apiError(
            'provider_unavailable',
            timedOut ? 'Translation timed out.' : 'Translation is temporarily unavailable.',
          ),
        );
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
