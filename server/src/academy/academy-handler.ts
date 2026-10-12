import type { ServerResponse } from 'node:http';

import { apiError } from '../http/api-error';
import { sendError, sendJson } from '../http/json';

import type { DailyAllowance, EntitlementChecker } from './access';
import {
  RUBRIC_KEYS,
  type AcademyProvider,
  type AssessRequest,
  type ReportRequest,
  type RoleplayRequest,
  type RoleplayScene,
  type RoleplayTurn,
  type Rubric,
} from './contract';

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
/** The final exam's conversation runs longer, so it keeps more of itself. */
const MAX_FINAL_HISTORY = 24;
/** A whole final conversation, both sides. */
const MAX_TRANSCRIPT = 30;
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

function readHistory(value: unknown, max = MAX_HISTORY): RoleplayTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isRecord)
    .map((turn) => ({
      role: turn.role === 'partner' ? ('partner' as const) : ('learner' as const),
      text: text(turn.text, MAX_HEARD),
    }))
    .filter((turn) => turn.text.length > 0)
    .slice(-max);
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
  const final = payload.final === true;
  const history = readHistory(payload.history, final ? MAX_FINAL_HISTORY : MAX_HISTORY);
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

  return { learning, scene, words, heard, history, addressAs, ...(final ? { final } : {}) };
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

// --- The final exam ------------------------------------------------------------------------

export function parseAssessRequest(payload: unknown): AssessRequest | undefined {
  if (!isRecord(payload)) return undefined;
  const learning = readLanguage(payload.learning);
  const scene = readScene(payload.scene);
  if (!learning || !scene || learning.toLowerCase().startsWith('en')) return undefined;
  const transcript = readHistory(payload.transcript, MAX_TRANSCRIPT);
  // Nothing to mark without the learner saying something.
  if (!transcript.some((turn) => turn.role === 'learner')) return undefined;
  return { learning, scene, transcript };
}

const share = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : undefined;

function readRubric(value: unknown): Rubric | undefined {
  if (!isRecord(value)) return undefined;
  const rubric = {} as Rubric;
  for (const key of RUBRIC_KEYS) {
    const mark = value[key];
    if (typeof mark !== 'number' || !Number.isInteger(mark) || mark < 1 || mark > 5) {
      return undefined;
    }
    rubric[key] = mark;
  }
  return rubric;
}

const words = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map((word) => text(word, MAX_WORD))
        .filter(Boolean)
        .slice(0, MAX_WORDS)
    : [];

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 0 ? Math.min(value, 10_000) : 0;

export function parseReportRequest(payload: unknown): ReportRequest | undefined {
  if (!isRecord(payload)) return undefined;
  const learning = readLanguage(payload.learning);
  const writtenScore = share(payload.writtenScore);
  const rubric = readRubric(payload.rubric);
  const level =
    typeof payload.level === 'string' && /^[ABC][12]\+?$/.test(payload.level)
      ? payload.level
      : undefined;
  if (!learning || writtenScore === undefined || !rubric || !level) return undefined;

  const skills: Record<string, number> = {};
  if (isRecord(payload.skills)) {
    for (const [skill, value] of Object.entries(payload.skills).slice(0, 8)) {
      const measured = share(value);
      if (/^[a-z]{3,20}$/.test(skill) && measured !== undefined) skills[skill] = measured;
    }
  }

  return {
    learning,
    level,
    writtenScore,
    rubric,
    skills,
    strongWords: words(payload.strongWords),
    weakWords: words(payload.weakWords),
    daysDone: count(payload.daysDone),
    wordsKnown: count(payload.wordsKnown),
  };
}

// --- Handling -------------------------------------------------------------------------------

export type AcademyAction = 'roleplay' | 'assess' | 'report';

/** How each action is read, and what is said when it cannot be. */
const ACTIONS = {
  roleplay: {
    parse: parseRoleplayRequest,
    invalid: 'Provide learning, scene and what was said.',
    run: (provider: AcademyProvider, request: RoleplayRequest) => provider.roleplay(request),
  },
  assess: {
    parse: parseAssessRequest,
    invalid: 'Provide learning, scene and the conversation.',
    run: (provider: AcademyProvider, request: AssessRequest) => provider.assess(request),
  },
  report: {
    parse: parseReportRequest,
    invalid: 'Provide the scores the report is written from.',
    run: (provider: AcademyProvider, request: ReportRequest) => provider.report(request),
  },
} as const;

/**
 * `POST /academy/roleplay`, `/academy/assess` and `/academy/report`.
 *
 * One path for all three: validated before anything is spent, then counted
 * against the same daily allowance, since each is one billed model call.
 */
export async function handleAcademy(
  action: AcademyAction,
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

  const spec = ACTIONS[action];
  const request = spec.parse(payload);
  if (!request) {
    sendError(response, apiError('invalid_request', spec.invalid));
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
    // The union keeps each parse paired with its own run.
    const run = spec.run as (provider: AcademyProvider, request: unknown) => Promise<unknown>;
    sendJson(response, 200, await run(deps.provider, request));
  } catch {
    // Logged nowhere and returned nowhere: a provider error can quote the request.
    sendError(
      response,
      apiError('provider_unavailable', 'The AI partner is unavailable right now.'),
    );
  }
}

/** The lesson role-play, as it was called before the exam joined it. */
export const handleRoleplay = (
  response: ServerResponse,
  payload: unknown,
  deps: RoleplayDependencies,
) => handleAcademy('roleplay', response, payload, deps);
