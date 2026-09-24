import type { LanguageId } from '@/types';
import { err, ok } from '@/utils';

import { httpStatusError, type HttpClient } from '../../http';
import type { ServiceResult } from '../../types';
import type { NormalizedTranslationRequest } from '../translation-request';

import { backendAdapter } from './backend-adapter';
import { isOnlinePairSupported } from './online-language-support';
import type {
  ProviderAdapter,
  ProviderTranslation,
  TranslationProvider,
} from './translation-provider';

export type BackendProviderOptions = {
  /** Public base URL. Undefined means the provider reports itself unconfigured. */
  baseUrl?: string;
  translatePath: string;
  http: HttpClient;
  /** Swappable so a changed response shape is an adapter change only. */
  adapter?: ProviderAdapter;
};

/**
 * Talks to the Translita backend, which holds the provider credential.
 *
 * The app sends only the language pair and the text. It never sends, stores or
 * knows a provider API key — that stays server-side, which is the whole reason
 * this indirection exists.
 */
export function createBackendTranslationProvider(
  options: BackendProviderOptions,
): TranslationProvider {
  const adapter = options.adapter ?? backendAdapter;
  const configured = typeof options.baseUrl === 'string' && options.baseUrl.length > 0;

  const endpoint = () => `${(options.baseUrl ?? '').replace(/\/+$/, '')}${options.translatePath}`;

  return {
    name: adapter.provider,

    isConfigured() {
      return configured;
    },

    async supportsPair(source: LanguageId, target: LanguageId) {
      // The backend is authoritative and validates independently; this is a
      // fast local check so an unsupported pair never costs a round trip.
      return configured && isOnlinePairSupported(source, target);
    },

    async translate(request: NormalizedTranslationRequest): ServiceResult<ProviderTranslation> {
      if (!configured) {
        return err(httpStatusError(503, 'No Translita backend URL is configured for this build.'));
      }

      const response = await options.http.send({
        url: endpoint(),
        method: 'POST',
        body: {
          sourceLanguage: request.sourceLanguage,
          targetLanguage: request.targetLanguage,
          text: request.text,
        },
      });

      // Transport failure: already an AppError, pass it through untouched.
      if (!response.ok) return response;

      const { status, ok: succeeded, data } = response.value;
      if (!succeeded) return err(backendStatusError(status, data));

      const translation = adapter.toTranslation(data);
      if (!translation.ok) return translation;

      return ok(translation.value);
    },
  };
}

/**
 * The backend answers failures with `{ error: { code, message } }`. Its codes
 * are more specific than a bare status, so prefer them when present and fall
 * back to the status otherwise.
 */
function backendStatusError(status: number, data: unknown) {
  const code = readErrorCode(data);

  switch (code) {
    case 'unsupported_language':
      return httpStatusError(422);
    case 'text_too_long':
    case 'invalid_request':
      return httpStatusError(400);
    case 'rate_limited':
      return httpStatusError(429);
    case 'provider_unavailable':
    case 'provider_error':
      return httpStatusError(503);
    default:
      return httpStatusError(status);
  }
}

function readErrorCode(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const error = (data as { error?: unknown }).error;
  if (typeof error !== 'object' || error === null) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}
