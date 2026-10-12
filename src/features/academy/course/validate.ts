import { APP_LANGUAGES } from '@/i18n';

import type { BaseLanguage } from './types';

/** The course's fixed shape: 12 chapters of 5 days, the fifth a checkpoint. */
export const COURSE_SHAPE = {
  chapters: 12,
  daysPerChapter: 5,
  minItems: 5,
  maxItems: 8,
  minDialogueLines: 4,
  maxDialogueLines: 10,
} as const;

export const COURSE_DAYS = COURSE_SHAPE.chapters * COURSE_SHAPE.daysPerChapter;

/** Every language a course is explained in. */
export const BASE_LANGUAGES: readonly BaseLanguage[] = APP_LANGUAGES.map(
  (language) => language.code,
).filter((code): code is BaseLanguage => code !== 'en');

const pad = (n: number) => String(n).padStart(2, '0');

type Path = string;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/**
 * Everything wrong with a chapter, as readable lines; empty when it is sound.
 *
 * Takes `unknown` on purpose: it is what the generator's output and a
 * bundled JSON file both really are until checked. Run by the course tests
 * on every chapter the app ships, so a bad file fails the build rather than
 * a lesson.
 */
export function validateChapter(chapter: unknown, expectedNumber?: number): string[] {
  const problems: string[] = [];
  const fail = (path: Path, message: string) => problems.push(`${path}: ${message}`);

  const text = (value: unknown, path: Path) => {
    if (!isText(value)) fail(path, 'missing text');
  };
  const localized = (value: unknown, path: Path) => {
    if (!isRecord(value)) return fail(path, 'missing translations');
    for (const code of BASE_LANGUAGES) {
      if (!isText(value[code])) fail(`${path}.${code}`, 'missing translation');
    }
  };

  if (!isRecord(chapter)) return ['chapter: not an object'];

  const number = chapter.number;
  if (typeof number !== 'number' || !Number.isInteger(number) || number < 1) {
    fail('number', 'not a chapter number');
    return problems;
  }
  if (expectedNumber !== undefined && number !== expectedNumber) {
    fail('number', `expected ${expectedNumber}, found ${number}`);
  }
  const chapterId = `c${pad(number)}`;
  if (chapter.id !== chapterId) fail('id', `expected ${chapterId}`);
  text(chapter.title, 'title');
  localized(chapter.titleMeaning, 'titleMeaning');

  const lessons = chapter.lessons;
  if (!Array.isArray(lessons) || lessons.length !== COURSE_SHAPE.daysPerChapter) {
    fail('lessons', `expected ${COURSE_SHAPE.daysPerChapter} days`);
    return problems;
  }

  const seenItems = new Set<string>();
  lessons.forEach((lesson: unknown, index) => {
    const dayInChapter = index + 1;
    const at = `${chapterId}-d${dayInChapter}`;
    if (!isRecord(lesson)) return fail(at, 'not an object');

    if (lesson.id !== at) fail(`${at}.id`, `expected ${at}`);
    const day = (number - 1) * COURSE_SHAPE.daysPerChapter + dayInChapter;
    if (lesson.day !== day) fail(`${at}.day`, `expected ${day}`);
    text(lesson.title, `${at}.title`);
    localized(lesson.titleMeaning, `${at}.titleMeaning`);

    const checkpoint = dayInChapter === COURSE_SHAPE.daysPerChapter;
    if (lesson.checkpoint !== checkpoint) fail(`${at}.checkpoint`, `expected ${checkpoint}`);

    const items = lesson.items;
    if (!Array.isArray(items)) {
      fail(`${at}.items`, 'missing');
    } else if (checkpoint) {
      if (items.length) fail(`${at}.items`, 'a checkpoint teaches nothing new');
    } else {
      if (items.length < COURSE_SHAPE.minItems || items.length > COURSE_SHAPE.maxItems) {
        fail(`${at}.items`, `expected ${COURSE_SHAPE.minItems}–${COURSE_SHAPE.maxItems}`);
      }
      items.forEach((item: unknown, i) => {
        const itemAt = `${at}-i${i + 1}`;
        if (!isRecord(item)) return fail(itemAt, 'not an object');
        if (item.id !== itemAt) fail(`${itemAt}.id`, `expected ${itemAt}`);
        text(item.text, `${itemAt}.text`);
        text(item.example, `${itemAt}.example`);
        localized(item.meaning, `${itemAt}.meaning`);
        localized(item.exampleMeaning, `${itemAt}.exampleMeaning`);
        const key = String(item.text).trim().toLowerCase();
        if (seenItems.has(key))
          fail(`${itemAt}.text`, `"${String(item.text)}" twice in the chapter`);
        seenItems.add(key);
      });
    }

    if (checkpoint) {
      if (lesson.tip !== undefined) fail(`${at}.tip`, 'a checkpoint has no tip');
    } else if (!isRecord(lesson.tip)) {
      fail(`${at}.tip`, 'missing');
    } else {
      text(lesson.tip.text, `${at}.tip.text`);
      localized(lesson.tip.explanation, `${at}.tip.explanation`);
    }

    const dialogue = lesson.dialogue;
    if (
      !Array.isArray(dialogue) ||
      dialogue.length < COURSE_SHAPE.minDialogueLines ||
      dialogue.length > COURSE_SHAPE.maxDialogueLines
    ) {
      fail(
        `${at}.dialogue`,
        `expected ${COURSE_SHAPE.minDialogueLines}–${COURSE_SHAPE.maxDialogueLines} lines`,
      );
    } else {
      dialogue.forEach((line: unknown, i) => {
        const lineAt = `${at}.dialogue[${i}]`;
        if (!isRecord(line)) return fail(lineAt, 'not an object');
        if (line.speaker !== 'A' && line.speaker !== 'B') fail(`${lineAt}.speaker`, 'A or B');
        text(line.text, `${lineAt}.text`);
        localized(line.meaning, `${lineAt}.meaning`);
      });
    }

    const scenario = lesson.scenario;
    if (!isRecord(scenario)) {
      fail(`${at}.scenario`, 'missing');
    } else {
      text(scenario.partnerRole, `${at}.scenario.partnerRole`);
      text(scenario.learnerRole, `${at}.scenario.learnerRole`);
      text(scenario.brief, `${at}.scenario.brief`);
      localized(scenario.goal, `${at}.scenario.goal`);
    }
  });

  return problems;
}
