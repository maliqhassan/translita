import type { AppError, AppErrorCode } from '@/types';

/**
 * User-facing copy for failures. Nothing technical reaches the screen: the
 * `AppError.message` is for logs, this map is for people.
 */
const ERROR_MESSAGES: Record<AppErrorCode, string> = {
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
  return ERROR_MESSAGES[error.code];
}
