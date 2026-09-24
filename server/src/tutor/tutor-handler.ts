import type { ServerResponse } from 'node:http';

import { apiError } from '../http/api-error';
import { sendError, sendJson } from '../http/json';

import type { TutorProvider, TutorRequest, TutorTurn } from './contract';

/**
 * `POST /tutor`.
 *
 * Validates hard before spending anything. Every rejection below happens
 * before the provider is called, because unlike the translation provider this
 * one bills per request and a malformed body should never cost money.
 */

/** Long enough for a spoken sentence, short enough to bound the cost. */
const MAX_HEARD = 400;
/** Enough thread for the tutor to stay coherent, and no more. */
const MAX_HISTORY = 8;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A BCP-47-ish base code. Deliberately strict: this reaches a prompt. */
function readLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(trimmed) ? trimmed : undefined;
}

function readHistory(value: unknown): TutorTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((turn) => ({
      role: turn.role === 'tutor' ? ('tutor' as const) : ('learner' as const),
      text: typeof turn.text === 'string' ? turn.text.slice(0, MAX_HEARD) : '',
    }))
    .filter((turn) => turn.text.trim().length > 0)
    .slice(-MAX_HISTORY);
}

export function parseTutorRequest(payload: unknown): TutorRequest | undefined {
  if (!isRecord(payload)) return undefined;

  const learning = readLanguage(payload.learning);
  const native = readLanguage(payload.native);
  const heard = typeof payload.heard === 'string' ? payload.heard.trim() : '';

  if (!learning || !native || !heard) return undefined;
  if (heard.length > MAX_HEARD) return undefined;
  // Practising a language by speaking it to yourself is not a conversation.
  if (learning.toLowerCase() === native.toLowerCase()) return undefined;

  return { learning, native, heard, history: readHistory(payload.history) };
}

export async function handleTutor(
  response: ServerResponse,
  provider: TutorProvider | undefined,
  payload: unknown,
): Promise<void> {
  if (!provider) {
    // Deployed without a credential. Said plainly, without hinting at what
    // the credential is or where it would come from.
    sendError(
      response,
      apiError('provider_unavailable', 'Language practice is not available on this server.'),
    );
    return;
  }

  const request = parseTutorRequest(payload);
  if (!request) {
    sendError(response, apiError('invalid_request', 'Provide learning, native and heard.'));
    return;
  }

  try {
    sendJson(response, 200, await provider.respond(request));
  } catch {
    // The cause is logged nowhere and returned nowhere: a provider error can
    // quote the request, and the request can quote the credential's account.
    sendError(response, apiError('provider_unavailable', 'The tutor is unavailable right now.'));
  }
}
