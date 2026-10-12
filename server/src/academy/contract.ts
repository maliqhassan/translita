/**
 * The Academy's live role-play, as a contract.
 *
 * At the end of a lesson the learner plays the day's scene with an AI partner
 * in the language they are learning. The partner answers in short lines,
 * corrects mistakes with a one-line explanation in English, and closes the
 * scene once the learner has managed the goal.
 *
 * Shaped like the tutor next door: an interface, an OpenAI implementation,
 * and fakes in the tests. The credential stays on the server for the same
 * reason — an OpenAI key in an app bundle is an extractable invoice.
 */

export type RoleplayTurn = {
  /** `learner` is the person practising; `partner` is the AI's own lines. */
  role: 'learner' | 'partner';
  text: string;
};

export type RoleplayScene = {
  /** Who the AI plays: "a waiter at a busy café". */
  partnerRole: string;
  /** Who the learner plays: "a customer ordering breakfast". */
  learnerRole: string;
  /** How to play the scene. */
  brief: string;
  /** What the learner should manage. */
  goal: string;
};

export type RoleplayRequest = {
  /** The language being learned, as a BCP-47 code: `de`, `fr`, `es`. */
  learning: string;
  scene: RoleplayScene;
  /** The day's words, to use where they fit. */
  words: readonly string[];
  /** What the learner just said or typed. Empty to open the scene. */
  heard: string;
  /** Earlier turns, oldest first. */
  history: readonly RoleplayTurn[];
  /** For languages where some words change with the person addressed. */
  addressAs: 'male' | 'female' | 'unspecified';
};

/** A mistake in what the learner said, and how to say it better. */
export type Correction = {
  said: string;
  better: string;
  /** One short sentence, in English. */
  why: string;
};

export type RoleplayReply =
  | {
      kind: 'reply';
      /** Null when there was nothing to correct, or nothing said yet. */
      correction: Correction | null;
      /** The partner's line, in the language being learned. */
      reply: string;
      /** The line in English. */
      replyMeaning: string;
      /** The scene is over: the goal was reached, or it has gone on long enough. */
      done: boolean;
    }
  /** Off topic or abusive. The message is in English. */
  | { kind: 'declined'; message: string };

export type AcademyProvider = {
  /** The provider's own name, for `/health`. Never a credential. */
  readonly id: string;
  roleplay(request: RoleplayRequest): Promise<RoleplayReply>;
};
