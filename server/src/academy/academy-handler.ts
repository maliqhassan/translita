import type { ServerResponse } from 'node:http';

import { apiError } from '../http/api-error';
import { sendError, sendJson } from '../http/json';

import type { DailyAllowance, EntitlementChecker } from './access';
import type { AcademyProvider, RoleplayRequest, RoleplayScene, RoleplayTurn } from './contract';

/**
 * `POST /academy/roleplay`.
 *
 * Validates hard before spending anything: every rejection below happens
 * before the provider is called, because each call is billed.
 */

/** Long enough for a spoken or typed beginner line. */
const MAX_HEARD = 300;
/** The scene so far: enough to stay coherent, and no more. */
const MAX_HISTORY = 12;
const MAX_SCENE_FIELD = 400;
const MAX_WORDS = 12;
const MAX_WORD = 60;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const text = (value: unknown, max: number): string =>
  typeof value === 'string' ? value.trim().slice(0, max) : '';

/** A BCP-47-ish code. Strict, because it reaches a prompt. */
function readLanguage(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return /^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/.test(trimmed) ? trimmed : undefined;
}

function readScene(value: unknown): RoleplayScene | undefined {
  if (!isRecord(value)) return undefined;
  const scene = {
    partnerRole: text(value.partnerRole, MAX_SCENE_FIELD),
    learnerRole: text(value.learnerRole, MAX_SCENE_FIELD),
    brief: text(value.brief, MAX_SCENE_FIELD),
    goal: text(value.goal, MAX_SCENE_FIELD),
  };
  return Object.values(scene).every(Boolean) ? scene : undefined;
}

function readHistory(value: unknown): RoleplayTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((turn) => ({
      role: turn.role === 'partner' ? ('partner' as const) : ('learner' as const),
      text: text(turn.text, MAX_HEARD),
    }))
    .filter((turn) => turn.text.length > 0)
    .slice(-MAX_HISTORY);
}

export function parseRoleplayRequest(payload: unknown): RoleplayRequest | undefined {
  if (!isRecord(payload)) return undefined;
  const learning = readLanguage(payload.learning);
  const scene = readScene(payload.scene);
  if (!learning || !scene) return undefined;
  // Practising English from English is not what this is for.
  if (learning.toLowerCase().startsWith('en')) return undefined;

  const heard = typeof payload.heard === 'string' ? payload.heard.trim() : '';
  if (heard.length > MAX_HEARD) return undefined;
  const history = readHistory(payload.history);
  // Only the opening line may come without anything said.
  if (!heard && history.length > 0) return undefined;

  const words = Array.isArray(payload.words)
    ? payload.words
        .map((word) => text(word, MAX_WORD))
        .filter(Boolean)
        .slice(0, MAX_WORDS)
    : [];
  const addressAs =
    payload.addressAs === 'male' || payload.addressAs === 'female'
      ? payload.addressAs
      : 'unspecified';

  return { learning, scene, words, heard, history, addressAs };
}

/** RevenueCat's app user ids: anonymous ones start with `$RCAnonymousID:`. */
export function readUserId(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = raw?.trim();
  return trimmed && /^[\w$:.@-]{1,100}$/.test(trimmed) ? trimmed : undefined;
}

export type RoleplayDependencies = {
  provider: AcademyProvider | undefined;
  entitlements: EntitlementChecker;
  allowance: DailyAllowance;
  /** The app's user id, or the caller's address when it sent none. */
  userKey: string;
  userId: string | undefined;
};

export async function handleRoleplay(
  response: ServerResponse,
  payload: unknown,
  deps: RoleplayDependencies,
): Promise<void> {
  if (!deps.provider) {
    sendError(
      response,
      apiError('provider_unavailable', 'The AI partner is not available on this server.'),
    );
    return;
  }

  const request = parseRoleplayRequest(payload);
  if (!request) {
    sendError(response, apiError('invalid_request', 'Provide learning, scene and what was said.'));
    return;
  }

  const withAcademy = deps.userId ? await deps.entitlements.hasAcademy(deps.userId) : false;
  if (!deps.allowance.take(deps.userKey, withAcademy)) {
    sendError(
      response,
      apiError('rate_limited', 'That is all the AI practice for today. It comes back tomorrow.'),
    );
    return;
  }

  try {
    sendJson(response, 200, await deps.provider.roleplay(request));
  } catch {
    // Logged nowhere and returned nowhere: a provider error can quote the request.
    sendError(
      response,
      apiError('provider_unavailable', 'The AI partner is unavailable right now.'),
    );
  }
}
