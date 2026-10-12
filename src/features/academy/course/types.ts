/**
 * The shape of a course, as shipped inside the app.
 *
 * Every course is taught from English: the words, examples and dialogues are
 * in the language being learned (German, French, Spanish…), and everything
 * that explains them — meanings, tips, goals — is in English.
 *
 * A course is fixed content, written once by `server/scripts/generate-course.mts`,
 * checked, and bundled, so lessons work with no connection and every learner
 * sees the same reviewed material. What makes it personal is which parts are
 * shown and how much practice is drawn from them, not different text.
 *
 * Exercises are not stored. They are built at run time from the items (pick
 * the meaning, match pairs, build the sentence, listen, say it), so the
 * content stays small and an exercise can never disagree with its item.
 */

/** A word or phrase to learn, with an example of it in use. */
export type CourseItem = {
  /** `c01-d1-i1`: chapter, day within the chapter, item. */
  id: string;
  /** In the language being learned. */
  text: string;
  /** In English. */
  meaning: string;
  /** A short sentence using it, in the language being learned. */
  example: string;
  /** The example in English. */
  exampleMeaning: string;
};

/** One line of the scripted dialogue — the role-play when there is no connection. */
export type DialogueLine = {
  /** `A` is the other person; `B` is the learner's part. */
  speaker: 'A' | 'B';
  /** In the language being learned. */
  text: string;
  /** In English. */
  meaning: string;
};

/** What the AI partner plays, for the live role-play. All in English. */
export type Scenario = {
  /** "A waiter at a busy café". */
  partnerRole: string;
  /** "A customer ordering breakfast". */
  learnerRole: string;
  /** Instructions for the AI partner. Never shown to the learner. */
  brief: string;
  /** What the learner should manage, shown before they start. */
  goal: string;
};

export type CourseLesson = {
  /** `c01-d1`. */
  id: string;
  /** 1–60, across the whole course. */
  day: number;
  /** In English. */
  title: string;
  /**
   * The last day of a chapter. It teaches nothing new: its quiz is drawn from
   * the chapter's other days, and it must be passed to go on.
   */
  checkpoint: boolean;
  /** Empty on a checkpoint. */
  items: readonly CourseItem[];
  /** A short grammar or usage note in English, quoting the words it explains. Absent on a checkpoint. */
  tip?: string;
  dialogue: readonly DialogueLine[];
  scenario: Scenario;
};

export type CourseChapter = {
  /** `c01`. */
  id: string;
  /** 1–12. */
  number: number;
  /** In English. */
  title: string;
  lessons: readonly CourseLesson[];
};

/** A whole course, by the language it teaches. */
export type Course = {
  /** The language taught, as a language id: `de`, `fr`, `es`. Also the course id. */
  id: string;
  chapters: readonly CourseChapter[];
};
