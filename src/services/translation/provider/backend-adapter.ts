import { getLanguage } from '@/constants';
import type { AppError } from '@/types';
import { err, ok, type Result } from '@/utils';

import { invalidResponseError } from '../../http';

import type { ProviderAdapter, ProviderTranslation } from './translation-provider';

/**
 * Validates the Translita backend's translation payload.
 *
 * A response is not trusted because it parsed as JSON. Every field is checked
 * for presence and type before anything reaches the app, and a payload that
 * fails becomes an `invalid_response` error rather than a `TranslationResult`
 * with undefined text in it.
 *
 * Expected shape:
 *   { translatedText: string, detectedLanguage?: string, provider?: string }
 */

const PROVIDER_NAME = 'transee-backend';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(
  record: Record<string, unknown>,
  key: string,
): Result<string | undefined, AppError> {
  const value = record[key];
  if (value === undefined || value === null) return ok(undefined);
  if (typeof value !== 'string') {
    return err(invalidResponseError(`Field "${key}" was ${typeof value}, expected a string.`));
  }
  return ok(value);
}

export const backendAdapter: ProviderAdapter = {
  provider: PROVIDER_NAME,

  toTranslation(payload: unknown): Result<ProviderTranslation, AppError> {
    if (!isRecord(payload)) {
      return err(invalidResponseError('Response body was not a JSON object.'));
    }

    const translatedText = payload.translatedText;
    if (typeof translatedText !== 'string') {
      return err(
        invalidResponseError(
          `Field "translatedText" was ${translatedText === undefined ? 'missing' : typeof translatedText}, expected a string.`,
        ),
      );
    }

    // An empty translation is a failure, not a result the user should see.
    if (translatedText.length === 0) {
      return err(invalidResponseError('Field "translatedText" was empty.'));
    }

    const detected = readOptionalString(payload, 'detectedLanguage');
    if (!detected.ok) return detected;

    // A detected language we cannot resolve is dropped rather than propagated:
    // the translation is still good, and the UI would have nothing to show.
    const detectedLanguage =
      detected.value && getLanguage(detected.value) ? detected.value : undefined;

    const provider = readOptionalString(payload, 'provider');
    if (!provider.ok) return provider;

    return ok({
      translatedText,
      detectedLanguage,
      providerName: provider.value ?? PROVIDER_NAME,
    });
  },
};
