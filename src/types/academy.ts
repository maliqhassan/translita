/**
 * The AI Academy's saved state: who is learning what, and how far they are.
 *
 * Stored in the local database through `AcademyRepository`, never in
 * preferences — this is the user's work, and it grows with every lesson.
 * Everything is keyed by course (`'en'` for the English course), so a second
 * course later is a new key, not a migration.
 */

/** Why someone is learning. Chooses scenario flavour and chapter emphasis. */
export type LearningGoal = 'travel' | 'business' | 'conversation';

/** Where someone starts: from the beginning, or placed further in. */
export type LearningLevel = 'beginner' | 'some';

/**
 * How the learner wants to be addressed, for languages where some words change
 * with the speaker ("je suis prêt" / "je suis prête"). Optional: unspecified
 * uses forms that work for anyone where the language has them.
 */
export type AddressForm = 'male' | 'female' | 'unspecified';

export type Enrollment = {
  /** The language being learned, which is also the course id: `de`, `fr`, `es`. */
  courseId: string;
  /** The language the course is taught from. Always English for now. */
  baseLanguage: string;
  goal: LearningGoal;
  level: LearningLevel;
  /** 5 (casual) or 15 (serious). Changes practice per day, not course length. */
  minutesPerDay: number;
  addressAs: AddressForm;
  /** The first day of their path: 1, or later after a placement quiz. */
  startDay: number;
  startedAt: number;
  /** The course shown is the one opened last; switching courses updates this. */
  lastOpenedAt: number;
  /** Set once the final exam is passed. */
  completedAt?: number;
};

/** A finished day. Kept at its best score across attempts. */
export type LessonProgress = {
  courseId: string;
  lessonId: string;
  day: number;
  /** 0–1, the best so far. */
  score: number;
  stars: number;
  attempts: number;
  /** When it was first completed. */
  completedAt: number;
};

/**
 * How well one word or phrase is known, for spaced review.
 *
 * A Leitner box: right answers move it up and space its reviews out; a wrong
 * one sends it back to be seen again soon.
 */
export type ItemStat = {
  courseId: string;
  itemId: string;
  correct: number;
  wrong: number;
  /** 0 (new) to 6 (known). */
  box: number;
  lastSeenAt: number;
  nextReviewAt: number;
};

/**
 * Where the learner is inside a lesson, saved after every step, so leaving for
 * the translator — or the app being closed — resumes at the same place.
 */
export type LessonPosition = {
  courseId: string;
  lessonId: string;
  /** Index of the step within the lesson. */
  step: number;
  /** The step's own state (answers so far, the role-play so far), as JSON-safe data. */
  state: unknown;
  updatedAt: number;
};

export type AcademyResultKind = 'checkpoint' | 'final_written' | 'final_conversation' | 'report';

/** A graded outcome worth keeping: a checkpoint, the final exam parts, the report. */
export type AcademyResult = {
  id: string;
  courseId: string;
  kind: AcademyResultKind;
  /** The lesson it belongs to, for a checkpoint. */
  lessonId?: string;
  /** 0–1. */
  score: number;
  passed: boolean;
  /** Details: rubric scores, the report text. JSON-safe. */
  data?: unknown;
  createdAt: number;
};
