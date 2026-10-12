import type { AppLanguageCode } from '@/i18n';

/**
 * The shape of a course, as shipped inside the app.
 *
 * A course is fixed content — written once by `server/scripts/generate-course.ts`,
 * reviewed, and bundled — so lessons work with no connection and every
 * learner sees the same, checked material. What makes it personal is which
 * parts are shown and how much practice is drawn from them, not different
 * text per person.
 *
 * Exercises are not stored. They are built at run time from the items (pick
 * the meaning, match pairs, build the sentence, listen, say it), so the
 * content stays small and an exercise can never disagree with its item.
 */

/** Every app language a course explains itself in: all of them but the one being taught. */
export type BaseLanguage = Exclude<AppLanguageCode, 'en'>;

/** One text in each base language. */
export type Localized = Readonly<Record<BaseLanguage, string>>;

/** A word or phrase to learn, with an example of it in use. */
export type CourseItem = {
  /** `c01-d1-i1`: chapter, day within the chapter, item. */
  id: string;
  /** In the language being taught. */
  text: string;
  meaning: Localized;
  /** A short sentence using it, in the language being taught. */
  example: string;
  exampleMeaning: Localized;
};

/** One line of the scripted dialogue — the role-play when there is no connection. */
export type DialogueLine = {
  /** `A` is the other person; `B` is the learner's part. */
  speaker: 'A' | 'B';
  text: string;
  meaning: Localized;
};

/** What the AI partner plays, for the live role-play. */
export type Scenario = {
  /** Who the AI is, in the language being taught: "a waiter at a busy café". */
  partnerRole: string;
  /** Who the learner is: "a customer ordering breakfast". */
  learnerRole: string;
  /** Instructions for the AI partner, in English. Never shown to the learner. */
  brief: string;
  /** What the learner should manage, shown before they start. */
  goal: Localized;
};

/** A short grammar or usage note. */
export type Tip = {
  /** In English, for reference and for the AI. */
  text: string;
  /** The same note explained in the learner's language. */
  explanation: Localized;
};

export type CourseLesson = {
  /** `c01-d1`. */
  id: string;
  /** 1–60, across the whole course. */
  day: number;
  title: string;
  titleMeaning: Localized;
  /**
   * The last day of a chapter. It teaches nothing new: its quiz is drawn from
   * the chapter's other days, and it must be passed to go on.
   */
  checkpoint: boolean;
  /** Empty on a checkpoint. */
  items: readonly CourseItem[];
  /** Absent on a checkpoint. */
  tip?: Tip;
  dialogue: readonly DialogueLine[];
  scenario: Scenario;
};

export type CourseChapter = {
  /** `c01`. */
  id: string;
  /** 1–12. */
  number: number;
  title: string;
  titleMeaning: Localized;
  lessons: readonly CourseLesson[];
};
