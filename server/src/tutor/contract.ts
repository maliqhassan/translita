/**
 * The language-practice tutor, as a contract.
 *
 * Shaped like the translation provider next door: an interface, a real
 * implementation and a fake, so the handler can be exercised without a
 * credential or a network. Nothing above this file knows which model answers.
 *
 * The whole reason this lives on the server is the credential. An OpenAI key
 * in the app bundle is an extractable key, and unlike the translation provider
 * there is no free tier that caps what a stolen one can spend.
 */

export type TutorTurn = {
  /** `learner` is the person practising; `tutor` is the model's own replies. */
  role: 'learner' | 'tutor';
  text: string;
};

export type TutorRequest = {
  /** The language being practised, as a BCP-47 base code. */
  learning: string;
  /** The learner's own language, used for the gloss and for refusals. */
  native: string;
  /** What the recogniser heard, verbatim. */
  heard: string;
  /** Earlier turns, oldest first, so the tutor can hold a thread. */
  history: readonly TutorTurn[];
};

export type TutorReply =
  /** A normal reply: an answer in the target language, plus a question back. */
  | {
      kind: 'reply';
      /**
       * What the learner said, translated into their own language.
       *
       * So they can confirm they were understood as they meant to be, the same
       * way the reply and the follow-up are each paired with their own
       * language. Without it, only the tutor's half of the exchange was ever
       * shown bilingually — the learner's own words were not.
       */
      heardGloss: string;
      /** In the language being learned. */
      reply: string;
      /** The same thing in the learner's language, so they can check themselves. */
      gloss: string;
      /** A question back, in the language being learned, to keep the thread going. */
      followUp: string;
      /** The same question, in the learner's language. */
      followUpGloss: string;
    }
  /**
   * What was heard did not resolve to something sayable, so the tutor offers
   * what it thinks was meant instead of guessing.
   */
  | { kind: 'clarify'; options: readonly string[] }
  /**
   * Outside language practice — off topic, or abusive. The message is in the
   * learner's language, because someone who has wandered off topic is not
   * necessarily able to read a refusal in the one they are learning.
   */
  | { kind: 'declined'; message: string };

export type TutorProvider = {
  /** The provider's own name, for `/health`. Never a credential. */
  readonly id: string;
  respond(request: TutorRequest): Promise<TutorReply>;
};
