import type { LanguageId } from '@/types';
import { appError, err, ok } from '@/utils';

import { httpStatusError, type HttpClient } from '../http';
import type { Service, ServiceResult } from '../types';

/**
 * The Academy's AI role-play partner, over the app's own backend.
 *
 * **There is no model credential in this app, and there must never be one.**
 * The partner runs on the server with the tutor's key. The server also decides
 * how much a user may practise each day, asking RevenueCat whether they have
 * the Academy — so this sends RevenueCat's own user id, which identifies an
 * install and grants nothing by itself.
 */

export type CoachTurn = {
  role: 'learner' | 'partner';
  text: string;
};

export type CoachScene = {
  partnerRole: string;
  learnerRole: string;
  brief: string;
  goal: string;
};

export type CoachAsk = {
  /** The language being learned. */
  learning: LanguageId;
  scene: CoachScene;
  /** The day's words, for the partner to use where they fit. */
  words: readonly string[];
  /** What the learner just said or typed. Empty to open the scene. */
  heard: string;
  history: readonly CoachTurn[];
  addressAs: 'male' | 'female' | 'unspecified';
  /** The final exam's conversation: longer, across the whole course. */
  final?: boolean;
};

export type CoachCorrection = { said: string; better: string; why: string };

export type CoachReply =
  | {
      kind: 'reply';
      correction: CoachCorrection | null;
      /** In the language being learned. */
      reply: string;
      /** In English. */
      replyMeaning: string;
      /** The scene is over. */
      done: boolean;
    }
  /** Off topic or abusive. In English. */
  | { kind: 'declined'; message: string };

export type BackendCoachOptions = {
  /** Absent in a build with no backend configured. */
  baseUrl?: string;
  path: string;
  /** Where the final conversation is marked, and the report written. */
  assessPath?: string;
  reportPath?: string;
  http: HttpClient;
  /** RevenueCat's user id for this install, when RevenueCat is running. */
  userId: () => Promise<string | undefined>;
};

/** Reads the server's union back, refusing anything that is not one of them. */
export function toCoachReply(data: unknown): CoachReply | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = data as Record<string, unknown>;
  const text = (source: Record<string, unknown>, key: string) =>
    typeof source[key] === 'string' ? source[key] : '';

  if (value.kind === 'declined') {
    const message = text(value, 'message');
    return message ? { kind: 'declined', message } : undefined;
  }
  if (value.kind !== 'reply') return undefined;

  const reply = text(value, 'reply');
  if (!reply) return undefined;
  let correction: CoachCorrection | null = null;
  if (typeof value.correction === 'object' && value.correction !== null) {
    const fix = value.correction as Record<string, unknown>;
    if (text(fix, 'said') && text(fix, 'better')) {
      correction = { said: text(fix, 'said'), better: text(fix, 'better'), why: text(fix, 'why') };
    }
  }
  return {
    kind: 'reply',
    correction,
    reply,
    replyMeaning: text(value, 'replyMeaning'),
    done: value.done === true,
  };
}

// --- The final exam ------------------------------------------------------------------------

/** The final conversation, marked 1–5 on each of five criteria. */
export type CoachRubric = {
  vocabulary: number;
  grammar: number;
  fluency: number;
  comprehension: number;
  task: number;
};

export const RUBRIC_KEYS: readonly (keyof CoachRubric)[] = [
  'vocabulary',
  'grammar',
  'fluency',
  'comprehension',
  'task',
];

export type CoachAssessAsk = {
  learning: LanguageId;
  scene: CoachScene;
  transcript: readonly CoachTurn[];
};

export type CoachAssessment = { rubric: CoachRubric; feedback: string };

/** What the report is written from: scores and words, never anything the user typed. */
export type CoachReportAsk = {
  learning: LanguageId;
  level: string;
  writtenScore: number;
  rubric: CoachRubric;
  skills: Readonly<Record<string, number>>;
  strongWords: readonly string[];
  weakWords: readonly string[];
  daysDone: number;
  wordsKnown: number;
};

export type CoachReport = {
  summary: string;
  strengths: readonly string[];
  weaknesses: readonly string[];
  suggestions: readonly string[];
  next: string;
};

export type CoachService = Service & {
  roleplay(ask: CoachAsk): ServiceResult<CoachReply>;
  /** Marks the final conversation. */
  assess(ask: CoachAssessAsk): ServiceResult<CoachAssessment>;
  /** Writes the end-of-course report. */
  report(ask: CoachReportAsk): ServiceResult<CoachReport>;
};

/** Reads a marking back, refusing anything that is not five marks from 1 to 5. */
export function toAssessment(data: unknown): CoachAssessment | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = data as Record<string, unknown>;
  if (typeof value.rubric !== 'object' || value.rubric === null) return undefined;
  const marks = value.rubric as Record<string, unknown>;
  const rubric = {} as CoachRubric;
  for (const key of RUBRIC_KEYS) {
    const mark = marks[key];
    if (typeof mark !== 'number' || !Number.isInteger(mark) || mark < 1 || mark > 5) {
      return undefined;
    }
    rubric[key] = mark;
  }
  return { rubric, feedback: typeof value.feedback === 'string' ? value.feedback : '' };
}

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((line): line is string => typeof line === 'string') : [];

export function toReport(data: unknown): CoachReport | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = data as Record<string, unknown>;
  if (typeof value.summary !== 'string' || !value.summary) return undefined;
  return {
    summary: value.summary,
    strengths: strings(value.strengths),
    weaknesses: strings(value.weaknesses),
    suggestions: strings(value.suggestions),
    next: typeof value.next === 'string' ? value.next : '',
  };
}

export function createBackendCoachService(options: BackendCoachOptions): CoachService {
  const configured = typeof options.baseUrl === 'string' && options.baseUrl.length > 0;
  const endpoint = (path: string) => `${(options.baseUrl ?? '').replace(/\/+$/, '')}${path}`;

  /**
   * One request to the Academy's server, read back by `read`.
   *
   * Sends RevenueCat's user id when there is one, so the server can count the
   * day's allowance per install and give Elite its larger share.
   */
  async function post<T>(
    path: string,
    body: unknown,
    read: (data: unknown) => T | undefined,
  ): ServiceResult<T> {
    if (!configured) {
      return err(httpStatusError(503, 'The AI partner needs a connection to Translita.'));
    }

    let userId: string | undefined;
    try {
      userId = await options.userId();
    } catch {
      // No id is fine: the server then counts the allowance per connection.
      userId = undefined;
    }

    const response = await options.http.send({
      url: endpoint(path),
      method: 'POST',
      headers: userId ? { 'x-app-user-id': userId } : undefined,
      body,
    });
    if (!response.ok) return response;

    const { status, ok: succeeded, data } = response.value;
    if (!succeeded) {
      if (status === 429) {
        return err(
          appError('rate_limited', "That's all the AI practice for today. It comes back tomorrow."),
        );
      }
      return err(httpStatusError(status, 'The AI partner is unavailable right now.'));
    }

    const value = read(data);
    return value !== undefined
      ? ok(value)
      : err(appError('invalid_response', 'The AI partner sent something unexpected.'));
  }

  return {
    id: 'coach.backend',

    async isAvailable() {
      return configured;
    },

    roleplay(ask) {
      return post(
        options.path,
        {
          learning: ask.learning,
          scene: ask.scene,
          words: ask.words.slice(0, 12),
          heard: ask.heard,
          // The server is the authority on this too; trimmed here so a long
          // scene is not uploaded in full on every turn.
          history: ask.history.slice(ask.final ? -24 : -12),
          addressAs: ask.addressAs,
          ...(ask.final ? { final: true } : {}),
        },
        toCoachReply,
      );
    },

    assess(ask) {
      return post(
        options.assessPath ?? '/academy/assess',
        { learning: ask.learning, scene: ask.scene, transcript: ask.transcript.slice(-30) },
        toAssessment,
      );
    },

    report(ask) {
      return post(options.reportPath ?? '/academy/report', ask, toReport);
    },
  };
}
