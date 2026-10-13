import { msg, t } from '@/i18n';
import type { CoachReport, CoachRubric } from '@/services';

import type { Skill } from './rules';

/**
 * The end-of-course report, as it is saved once the final exam is passed.
 *
 * Everything the report screen shows comes from here, so it reads the same
 * every time it is opened, with or without a connection. `written` is the
 * AI's own prose; without it, `localReport` writes plainer text from the same
 * numbers.
 */
export type FinalReport = {
  courseId: string;
  level: string;
  /** 0–1, Part A. */
  writtenScore: number;
  /** 0–1, Part B. */
  spokenScore: number;
  rubric: CoachRubric;
  skills: Partial<Record<Skill, number>>;
  /** The examiner's few sentences on the conversation. */
  feedback: string;
  written: CoachReport | null;
  strongWords: readonly string[];
  weakWords: readonly string[];
  daysDone: number;
  wordsKnown: number;
  completedAt: number;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

/** Whether saved data is a report this build can show. */
export function isFinalReport(value: unknown): value is FinalReport {
  return (
    isRecord(value) &&
    typeof value.courseId === 'string' &&
    typeof value.level === 'string' &&
    typeof value.writtenScore === 'number' &&
    typeof value.spokenScore === 'number' &&
    isRecord(value.rubric) &&
    isRecord(value.skills) &&
    Array.isArray(value.strongWords) &&
    Array.isArray(value.weakWords) &&
    typeof value.completedAt === 'number'
  );
}

/** Skills, by name. */
export const SKILL_LABEL: Record<Skill, string> = {
  reading: msg('Reading'),
  vocabulary: msg('Vocabulary'),
  listening: msg('Listening'),
  grammar: msg('Grammar'),
};

/** The speaking criteria, by name. */
export const RUBRIC_LABEL: Record<keyof CoachRubric, string> = {
  vocabulary: msg('Vocabulary'),
  grammar: msg('Grammar'),
  fluency: msg('Fluency'),
  comprehension: msg('Understanding'),
  task: msg('Getting it done'),
};

const percent = (share: number) => Math.round(share * 100);

/**
 * A report written from the numbers alone, for when the AI could not write
 * one. Plainer, and never wrong: every line is a measured fact.
 */
export function localReport(report: FinalReport): CoachReport {
  const skills = Object.entries(report.skills) as [Skill, number][];
  const strong = skills.filter(([, share]) => share >= 0.8);
  const weak = skills.filter(([, share]) => share < 0.7);
  const spoken = Object.entries(report.rubric) as [keyof CoachRubric, number][];

  return {
    summary: t(
      'You finished the course and passed both parts of the final exam: {written}% on the written test and {spoken}% on the conversation.',
      { written: percent(report.writtenScore), spoken: percent(report.spokenScore) },
    ),
    strengths: [
      ...strong.map(([skill, share]) =>
        t('{skill}: {percent}% right', { skill: t(SKILL_LABEL[skill]), percent: percent(share) }),
      ),
      ...spoken
        .filter(([, mark]) => mark >= 4)
        .map(([key, mark]) =>
          t('{skill} in conversation: {mark} of 5', { skill: t(RUBRIC_LABEL[key]), mark }),
        ),
    ],
    weaknesses: [
      ...weak.map(([skill, share]) =>
        t('{skill}: {percent}% right', { skill: t(SKILL_LABEL[skill]), percent: percent(share) }),
      ),
      ...spoken
        .filter(([, mark]) => mark <= 2)
        .map(([key, mark]) =>
          t('{skill} in conversation: {mark} of 5', { skill: t(RUBRIC_LABEL[key]), mark }),
        ),
    ],
    suggestions: [
      ...(report.weakWords.length ? [t('Review the words below until they come easily.')] : []),
      t('Keep speaking a little every day, out loud.'),
      t('Use the translator to look up things you want to say in your own life.'),
    ],
    next: t('Keep your streak going with review, and use the language whenever you can.'),
  };
}

/** What each level the course can reach means, on the European (CEFR) scale. */
export const LEVEL_MEANING: Record<string, string> = {
  A1: msg('Beginner: understands and uses familiar everyday phrases'),
  A2: msg('Elementary: handles simple, everyday conversations'),
  'A2+': msg('Strong elementary: confident in everyday situations'),
};
