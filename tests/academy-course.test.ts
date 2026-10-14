import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { getLanguage } from '@/constants';
import {
  COURSE_DAYS,
  COURSE_SHAPE,
  availableCourses,
  validateChapter,
} from '@/features/academy/course';
import { phraseKey } from '@/features/academy/course/validate';

const COURSE_DIR = 'src/features/academy/course';

/** A complete, valid chapter, to break one piece at a time. */
function sampleChapter(number = 1) {
  const id = `c${String(number).padStart(2, '0')}`;
  const line = (speaker: 'A' | 'B', text: string) => ({ speaker, text, meaning: `${text} (en)` });
  const scenario = {
    partnerRole: 'a waiter',
    learnerRole: 'a customer',
    brief: 'Take the order, one question at a time.',
    goal: 'Order a drink.',
  };
  const dialogue = [
    line('A', 'Hallo!'),
    line('B', 'Hallo.'),
    line('A', 'Kaffee?'),
    line('B', 'Ja, bitte.'),
  ];

  return {
    id,
    number,
    title: 'At the café',
    lessons: Array.from({ length: COURSE_SHAPE.daysPerChapter }, (_, index) => {
      const d = index + 1;
      const lessonId = `${id}-d${d}`;
      const checkpoint = d === COURSE_SHAPE.daysPerChapter;
      return {
        id: lessonId,
        day: (number - 1) * COURSE_SHAPE.daysPerChapter + d,
        title: `Day ${d}`,
        checkpoint,
        items: checkpoint
          ? []
          : Array.from({ length: 6 }, (_, i) => ({
              id: `${lessonId}-i${i + 1}`,
              text: `Wort ${d}.${i + 1}`,
              meaning: `word ${d}.${i + 1}`,
              example: `Ein Beispiel mit Wort ${d}.${i + 1}.`,
              exampleMeaning: 'An example.',
            })),
        ...(checkpoint ? {} : { tip: "Say 'bitte' to be polite." }),
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

  it('rejects a missing English meaning, naming where', () => {
    const chapter = sampleChapter();
    (chapter.lessons[0]!.items[0] as { meaning: string }).meaning = '';
    assert.deepEqual(validateChapter(chapter), ['c01-d1-i1.meaning: missing text']);
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

  it('treats a phrase and its unfinished form as the same, but different phrases as different', () => {
    assert.equal(phraseKey("'Soy de'"), phraseKey('Soy de ...'));
    assert.equal(phraseKey('¿De dónde eres?'), 'de dónde eres');
    assert.notEqual(phraseKey('Hola'), phraseKey('Adiós'));
    assert.notEqual(phraseKey('Ich bin'), phraseKey('Du bist'));
  });

  it('is 12 chapters of 5 days, 60 in all', () => {
    assert.equal(COURSE_DAYS, 60);
  });
});

describe('the courses the app ships', () => {
  it('teaches German, French, Spanish, Italian, Portuguese and Swedish, from English', () => {
    assert.deepEqual(
      availableCourses().map((course) => course.id),
      ['de', 'fr', 'es', 'it', 'pt-BR', 'sv'],
    );
    for (const course of availableCourses()) {
      assert.ok(getLanguage(course.id), `${course.id} is a language the app knows`);
    }
  });

  it('lists exactly the chapter files on disk, in order', () => {
    for (const course of availableCourses()) {
      const files = readdirSync(`${COURSE_DIR}/${course.id}`).filter((name) =>
        /^chapter-\d\d\.json$/.test(name),
      );
      assert.equal(course.chapters.length, files.length, course.id);
      course.chapters.forEach((chapter, index) => assert.equal(chapter.number, index + 1));
    }
  });

  it('has every chapter complete and correct', () => {
    for (const course of availableCourses()) {
      for (const chapter of course.chapters) {
        assert.deepEqual(
          validateChapter(chapter, chapter.number),
          [],
          `${course.id} ${chapter.number}`,
        );
      }
    }
  });

  it('teaches no word twice across a course', () => {
    for (const course of availableCourses()) {
      const seen = new Map<string, string>();
      for (const chapter of course.chapters) {
        for (const lesson of chapter.lessons) {
          for (const item of lesson.items) {
            const key = item.text.trim().toLowerCase();
            assert.equal(
              seen.has(key),
              false,
              `${course.id}: "${item.text}" in ${item.id} and ${seen.get(key)}`,
            );
            seen.set(key, item.id);
          }
        }
      }
    }
  });

  it('ships no course that has been removed', () => {
    assert.equal(existsSync(`${COURSE_DIR}/en`), false);
  });
});

describe('the course generator', () => {
  const script = () => readFileSync('server/scripts/generate-course.mts', 'utf8');

  it('reads the key from server/.env and sends it only to OpenAI', () => {
    assert.ok(script().includes("process.loadEnvFile(join(here, '..', '.env'))"));
    assert.ok(script().includes("fetch('https://api.openai.com/v1/chat/completions'"));
    assert.equal(/console\.(log|warn|error)\([^)]*API_KEY/.test(script()), false);
  });

  it('teaches from English, with a native editing pass', () => {
    assert.ok(script().includes('for adults who speak English'));
    assert.ok(script().includes('editChapter('));
  });

  it('follows the same 12-chapter syllabus the app expects', () => {
    const themes = script().match(/\btheme: '/g) ?? [];
    assert.equal(themes.length, COURSE_SHAPE.chapters);
  });
});
