import type { AppError, LanguageId } from '@/types';
import type { Result } from '@/utils';

import type { ServiceResult } from '../../types';
import type { NormalizedTranslationRequest } from '../translation-request';

/**
 * A translation as a provider returns it, already normalised into Translita's
 * vocabulary. No provider-specific field ever travels further than this.
 */
export type ProviderTranslation = {
  translatedText: string;
  /** Present when the provider detected the source itself. */
  detectedLanguage?: LanguageId;
  /** Who produced it. Diagnostics only — never shown to a user. */
  providerName: string;
};

/**
 * Validates and maps one provider's wire format.
 *
 * Splitting this from the provider is what keeps the chain honest:
 *
 *     TranslationService -> TranslationProvider -> ProviderAdapter -> wire
 *
 * Supporting a second provider, or a changed backend response, is a new
 * adapter — no service, router or screen changes.
 */
export type ProviderAdapter = {
  readonly provider: string;
  /** Takes an unvalidated payload; `unknown` in, validated shape out. */
  toTranslation(payload: unknown): Result<ProviderTranslation, AppError>;
};

/**
 * A reachable source of translations.
 *
 * For Translita this is always our own backend, which holds the provider
 * credential server-side. The interface stays provider-shaped so that
 * arrangement is a deployment decision rather than an architectural one.
 */
export type TranslationProvider = {
  readonly name: string;
  /** False when required configuration is missing, e.g. no backend URL. */
  isConfigured(): boolean;
  translate(request: NormalizedTranslationRequest): ServiceResult<ProviderTranslation>;
  /** Language pairs this provider will accept. */
  supportsPair(source: LanguageId, target: LanguageId): Promise<boolean>;
};
