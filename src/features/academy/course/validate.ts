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

const pad = (n: number) => String(n).padStart(2, '0');

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
  const fail = (path: string, message: string) => problems.push(`${path}: ${message}`);
  const text = (value: unknown, path: string) => {
    if (!isText(value)) fail(path, 'missing text');
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
        text(item.meaning, `${itemAt}.meaning`);
        text(item.example, `${itemAt}.example`);
        text(item.exampleMeaning, `${itemAt}.exampleMeaning`);
        const key = String(item.text).trim().toLowerCase();
        if (seenItems.has(key)) {
          fail(`${itemAt}.text`, `"${String(item.text)}" twice in the chapter`);
        }
        seenItems.add(key);
      });
    }

    if (checkpoint) {
      if (lesson.tip !== undefined) fail(`${at}.tip`, 'a checkpoint has no tip');
    } else {
      text(lesson.tip, `${at}.tip`);
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
        text(line.meaning, `${lineAt}.meaning`);
      });
    }

    const scenario = lesson.scenario;
    if (!isRecord(scenario)) {
      fail(`${at}.scenario`, 'missing');
    } else {
      for (const field of ['partnerRole', 'learnerRole', 'brief', 'goal'] as const) {
        text(scenario[field], `${at}.scenario.${field}`);
      }
    }
  });

  return problems;
}
