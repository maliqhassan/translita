import { t } from '@/i18n';
import type { AppError, AppErrorCode } from '@/types';

/**
 * User-facing copy for failures. Nothing technical reaches the screen: the
 * `AppError.message` is for logs, this map is for people.
 */
export const ERROR_MESSAGES: Record<AppErrorCode, string> = {
  network_unavailable: 'You appear to be offline. Check your connection and try again.',
  timeout: 'That took too long to respond. Please try again.',
  not_implemented: 'That is not available in this build yet.',
  service_unavailable: 'Translation is unavailable right now. Please try again in a moment.',
  rate_limited: 'Too many translations just now. Please wait a moment and try again.',
  permission_denied: 'Translita needs permission to do that. You can grant it in Settings.',
  invalid_request: 'That request could not be sent. Check the text and try again.',
  invalid_response: 'The translation came back in an unexpected form. Please try again.',
  unsupported_language: 'This language pair is not available yet. Try a different pair.',
  model_missing: 'That language pack is not downloaded yet.',
  entitlement_required: 'That is part of Translita Pro.',
  storage_error: 'Something went wrong saving to this device.',
  cancelled: 'That was cancelled.',
  unknown: 'Something went wrong. Please try again.',
};

export function errorMessage(error: AppError): string {
  return t(ERROR_MESSAGES[error.code]);
}

/**
 * What Scan and Speak say when they are tapped where they cannot run.
 *
 * The controls stay on screen either way, so a feature this build or device
 * lacks explains itself instead of looking as if it had been removed. Scanning
 * is missing only where the native recogniser is — Expo Go, in practice.
 * Speech can also be missing on a phone with no speech service installed.
 */
export const UNAVAILABLE_INPUT_MESSAGES = {
  scan: 'Scanning is not available here. It works in the installed Translita app, not in Expo Go.',
  speech:
    'Speech input is not available here. It needs the installed Translita app (not Expo Go) and a speech service on the phone, such as Google’s.',
  /** Tapped in the moment before the device and plan have both answered. */
  pending: 'Still getting ready. Try again in a moment.',
} as const;
