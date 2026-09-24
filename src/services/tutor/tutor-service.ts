import type { LanguageId } from '@/types';
import { appError, err, ok } from '@/utils';

import { httpStatusError, type HttpClient } from '../http';
import type { Service, ServiceResult } from '../types';

/**
 * Conversational language practice, over the app's own backend.
 *
 * **There is no model credential in this app, and there must never be one.**
 * The key sits on the server beside the translation credential, for the same
 * reason and one more: an OpenAI key bills without a cap, so a key extracted
 * from an APK is somebody's invoice rather than somebody's quota.
 *
 * The shape mirrors `backend-translation-provider`: a base URL, one POST, and
 * a status the caller can act on. Nothing here knows which model answers, and
 * swapping the model is a server deployment rather than an app release.
 */

export type TutorTurn = {
  role: 'learner' | 'tutor';
  text: string;
};

export type TutorAsk = {
  /** The language being practised. */
  learning: LanguageId;
  /** The learner's own language, used for the gloss and any refusal. */
  native: LanguageId;
  /** What the recogniser heard. */
  heard: string;
  history: readonly TutorTurn[];
};

export type TutorReply =
  | { kind: 'reply'; reply: string; gloss: string; followUp: string }
  /** What was heard was ambiguous; these are the phrases it might have been. */
  | { kind: 'clarify'; options: readonly string[] }
  /** Outside language practice. The message is in the learner's language. */
  | { kind: 'declined'; message: string };

export type TutorService = Service & {
  respond(ask: TutorAsk): ServiceResult<TutorReply>;
};

export type BackendTutorOptions = {
  /** Absent in a build with no backend configured. */
  baseUrl?: string;
  path: string;
  http: HttpClient;
};

/** Reads the server's union back, refusing anything that is not one of them. */
function toReply(data: unknown): TutorReply | undefined {
  if (typeof data !== 'object' || data === null) return undefined;
  const value = data as Record<string, unknown>;
  const text = (key: string) => (typeof value[key] === 'string' ? value[key] : '');

  if (value.kind === 'clarify') {
    const options = Array.isArray(value.options)
      ? value.options.filter((o): o is string => typeof o === 'string' && o.length > 0)
      : [];
    return options.length >= 2 ? { kind: 'clarify', options } : undefined;
  }

  if (value.kind === 'declined') {
    const message = text('message');
    return message ? { kind: 'declined', message } : undefined;
  }

  if (value.kind === 'reply') {
    const reply = text('reply');
    return reply
      ? { kind: 'reply', reply, gloss: text('gloss'), followUp: text('followUp') }
      : undefined;
  }

  return undefined;
}

export function createBackendTutorService(options: BackendTutorOptions): TutorService {
  const configured = typeof options.baseUrl === 'string' && options.baseUrl.length > 0;
  const endpoint = () => `${(options.baseUrl ?? '').replace(/\/+$/, '')}${options.path}`;

  return {
    id: 'tutor.backend',

    async isAvailable() {
      // Availability is about this build, not about the network: the screen
      // uses it to decide whether to offer practice at all.
      return configured;
    },

    async respond(ask: TutorAsk): ServiceResult<TutorReply> {
      if (!configured) {
        return err(httpStatusError(503, 'Language practice needs a connection to Translita.'));
      }

      const response = await options.http.send({
        url: endpoint(),
        method: 'POST',
        body: {
          learning: ask.learning,
          native: ask.native,
          heard: ask.heard,
          // Trimmed here as well as on the server. The server is the
          // authority; this keeps a long conversation from being uploaded in
          // full on every single turn.
          history: ask.history.slice(-8),
        },
      });

      if (!response.ok) return response;

      const { status, ok: succeeded, data } = response.value;
      if (!succeeded) {
        // 429 is the one worth naming: it is the rate limit doing its job, and
        // "try again shortly" is actionable where a generic failure is not.
        if (status === 429) {
          return err(
            appError('rate_limited', 'That is a lot of practice. Try again in a little while.'),
          );
        }
        return err(httpStatusError(status, 'Language practice is unavailable right now.'));
      }

      const reply = toReply(data);
      return reply ? ok(reply) : err(appError('invalid_response', 'The tutor replied oddly.'));
    },
  };
}
