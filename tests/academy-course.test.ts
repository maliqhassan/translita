import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ENGLISH_CHAPTERS } from '@/features/academy/course/en';
import {
  BASE_LANGUAGES,
  COURSE_DAYS,
  COURSE_SHAPE,
  validateChapter,
} from '@/features/academy/course/validate';

const COURSE_DIR = 'src/features/academy/course/en';

/** Every base language, all saying the same thing. */
const everywhere = (text: string) =>
  Object.fromEntries(BASE_LANGUAGES.map((code) => [code, `${text} (${code})`]));

/** A complete, valid chapter, to break one piece at a time. */
function sampleChapter(number = 1) {
  const id = `c${String(number).padStart(2, '0')}`;
  const line = (speaker: 'A' | 'B', text: string) => ({ speaker, text, meaning: everywhere(text) });
  const scenario = {
    partnerRole: 'a waiter',
    learnerRole: 'a customer',
    brief: 'Take the order, one question at a time.',
    goal: everywhere('Order a drink'),
  };
  const dialogue = [
    line('A', 'Hello!'),
    line('B', 'Hi.'),
    line('A', 'Coffee?'),
    line('B', 'Yes, please.'),
  ];

  return {
    id,
    number,
    title: 'At the café',
    titleMeaning: everywhere('At the café'),
    lessons: Array.from({ length: COURSE_SHAPE.daysPerChapter }, (_, index) => {
      const d = index + 1;
      const lessonId = `${id}-d${d}`;
      const checkpoint = d === COURSE_SHAPE.daysPerChapter;
      return {
        id: lessonId,
        day: (number - 1) * COURSE_SHAPE.daysPerChapter + d,
        title: `Day ${d}`,
        titleMeaning: everywhere(`Day ${d}`),
        checkpoint,
        items: checkpoint
          ? []
          : Array.from({ length: 6 }, (_, i) => ({
              id: `${lessonId}-i${i + 1}`,
              text: `word ${d}.${i + 1}`,
              meaning: everywhere(`word ${d}.${i + 1}`),
              example: `An example with word ${d}.${i + 1}.`,
              exampleMeaning: everywhere('An example'),
            })),
        ...(checkpoint
          ? {}
          : { tip: { text: 'Say please.', explanation: everywhere('Say please') } }),
        dialogue,
        scenario,
      };
    }),
  };
}

describe('a course chapter', () => {
  it('accepts a complete chapter', () => {
    assert.deepEqual(validateChapter(sampleChapter(), 1), []);
  });

  it('is explained in every app language but English', () => {
    assert.equal(BASE_LANGUAGES.length, 11);
    assert.equal(BASE_LANGUAGES.includes('en' as never), false);
  });

  it('rejects a missing translation, naming where', () => {
    const chapter = sampleChapter();
    delete (chapter.lessons[0]!.items[0]!.meaning as Record<string, string>).ur;
    assert.deepEqual(validateChapter(chapter), ['c01-d1-i1.meaning.ur: missing translation']);
  });

  it('rejects a day out of place, and a checkpoint that teaches', () => {
    const chapter = sampleChapter();
    chapter.lessons[1]!.day = 9;
    chapter.lessons[4]!.items = chapter.lessons[0]!.items;
    const problems = validateChapter(chapter);
    assert.ok(problems.includes('c01-d2.day: expected 2'));
    assert.ok(problems.includes('c01-d5.items: a checkpoint teaches nothing new'));
  });

  it('rejects the same word taught twice in a chapter', () => {
    const chapter = sampleChapter();
    chapter.lessons[1]!.items[0]!.text = chapter.lessons[0]!.items[0]!.text;
    assert.ok(validateChapter(chapter).some((problem) => problem.includes('twice in the chapter')));
  });

  it('is 12 chapters of 5 days, 60 in all', () => {
    assert.equal(COURSE_DAYS, 60);
  });
});

describe('the English course the app ships', () => {
  it('lists exactly the chapter files on disk, in order', () => {
    const files = readdirSync(COURSE_DIR).filter((name) => /^chapter-\d\d\.json$/.test(name));
    assert.equal(ENGLISH_CHAPTERS.length, files.length);
    ENGLISH_CHAPTERS.forEach((chapter, index) => assert.equal(chapter.number, index + 1));
  });

  it('has every chapter complete and correct', () => {
    for (const chapter of ENGLISH_CHAPTERS) {
      assert.deepEqual(validateChapter(chapter, chapter.number), [], `chapter ${chapter.number}`);
    }
  });

  it('teaches no word twice across the whole course', () => {
    const seen = new Map<string, string>();
    for (const chapter of ENGLISH_CHAPTERS) {
      for (const lesson of chapter.lessons) {
        for (const item of lesson.items) {
          const key = item.text.trim().toLowerCase();
          assert.equal(seen.has(key), false, `"${item.text}" in ${item.id} and ${seen.get(key)}`);
          seen.set(key, item.id);
        }
      }
    }
  });

  it('ships only the finished chapter, not the generator working data', () => {
    for (const name of readdirSync(COURSE_DIR).filter((n) => n.endsWith('.json'))) {
      const raw = JSON.parse(readFileSync(`${COURSE_DIR}/${name}`, 'utf8')) as Record<
        string,
        unknown
      >;
      assert.equal('english' in raw || 'translations' in raw, false, name);
    }
  });
});

describe('the course generator', () => {
  const script = () => readFileSync('server/scripts/generate-course.mts', 'utf8');

  it('reads the key from server/.env and sends it only to OpenAI', () => {
    assert.ok(script().includes("process.loadEnvFile(join(here, '..', '.env'))"));
    assert.ok(script().includes("fetch('https://api.openai.com/v1/chat/completions'"));
    assert.equal(/console\.(log|warn|error)\([^)]*API_KEY/.test(script()), false);
  });

  it('follows the same 12-chapter syllabus the app expects', () => {
    const themes = script().match(/\btheme: '/g) ?? [];
    assert.equal(themes.length, COURSE_SHAPE.chapters);
  });
});
