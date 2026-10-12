/**
 * Writes a course, one chapter at a time, with gpt-4o-mini.
 *
 * Every course is taught from English. Run from `server/`, with
 * OPENAI_API_KEY in `server/.env`:
 *
 *   node scripts/generate-course.mts --course de --chapter 1
 *   node scripts/generate-course.mts --course fr --chapter 1 --force   # write it again
 *
 * The course is written once, checked, and shipped inside the app — this is
 * the only place a model writes lessons. Two passes per chapter:
 *
 * 1. Writing: the words and phrases, examples, a tip, a scripted dialogue and
 *    a role-play brief for each day, in the language being learned, with
 *    every meaning in English, following a fixed syllabus so chapters build
 *    on each other and never repeat a word.
 * 2. Editing: a native-speaker pass over the whole chapter that corrects
 *    anything wrong or unnatural in the language being learned, and any
 *    English meaning that does not match.
 *
 * The chapter lands in `src/features/academy/course/<course>/`, and the list
 * of courses the app imports (`course/courses.ts`) is regenerated from the
 * files on disk. The draft is kept in `server/course-work/`, so a re-run can
 * resume and nothing extra ships in the app. The app's tests then check every
 * chapter (`validateChapter`), so `npm run check` is the final word on a file.
 *
 * SECURITY: the key is read from `server/.env` and only ever sent to OpenAI.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const COURSE_DIR = join(here, '..', '..', 'src', 'features', 'academy', 'course');
const WORK_DIR = join(here, '..', 'course-work');

try {
  process.loadEnvFile(join(here, '..', '.env'));
} catch {
  // No .env: the key may already be in the environment.
}

const API_KEY = process.env.OPENAI_API_KEY?.trim();
const MODEL = process.env.COURSE_MODEL?.trim() || process.env.TUTOR_MODEL?.trim() || 'gpt-4o-mini';

/**
 * The languages a course can teach, in the order the app lists them, with the
 * variety the model is told to write.
 */
const COURSE_LANGUAGES = {
  de: 'German (standard German as spoken in Germany)',
  fr: 'French (standard French as spoken in France)',
  es: 'Spanish (neutral, international Spanish)',
  it: 'Italian',
  'pt-BR': 'Brazilian Portuguese',
} as const;
type CourseLanguage = keyof typeof COURSE_LANGUAGES;

/** The syllabus: what each chapter is about. Grammar follows the language taught, A1 → A2. */
const SYLLABUS = [
  {
    theme: 'Greetings and introductions',
    focus: 'greeting, saying your name and where you are from, "to be", personal pronouns',
  },
  {
    theme: 'At the café',
    focus: 'ordering politely, please and thank you, numbers 1–20, food and drink words',
  },
  { theme: 'Shopping', focus: 'asking prices, this/that, numbers to 100, colours and sizes' },
  {
    theme: 'Asking for directions',
    focus: 'where is…?, giving directions with the imperative, words for places and position',
  },
  {
    theme: 'Getting around by transport',
    focus: 'telling the time, buying tickets, the present tense of common verbs',
  },
  {
    theme: 'At the airport',
    focus: 'saying what you would like, travel documents, asking questions',
  },
  { theme: 'At the hotel', focus: 'there is/there are, polite requests, reporting a problem' },
  { theme: 'At work', focus: 'jobs and the office, daily routines, meetings and schedules' },
  {
    theme: 'Health and the doctor',
    focus: 'the body, saying what hurts, the pharmacy, giving advice',
  },
  {
    theme: 'Phone calls and messages',
    focus: 'polite requests, spelling names, leaving and taking a message',
  },
  {
    theme: 'Making plans',
    focus: 'talking about the future, days and dates, invitations and replies',
  },
  {
    theme: 'Opinions and experiences',
    focus: 'the past tense of common verbs, giving opinions, likes and dislikes',
  },
] as const;

const DAYS = 5;

// --- OpenAI ------------------------------------------------------------------

async function ask<T>(
  system: string,
  user: string,
  schemaName: string,
  schema: object,
  temperature: number,
): Promise<T> {
  if (!API_KEY) throw new Error('OPENAI_API_KEY is not set. Add it to server/.env.');

  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
        signal: AbortSignal.timeout(180_000),
        body: JSON.stringify({
          model: MODEL,
          temperature,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
          response_format: {
            type: 'json_schema',
            json_schema: { name: schemaName, strict: true, schema },
          },
        }),
      });
      if (!response.ok) {
        // The body explains the failure; it never contains the key.
        throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
      }
      const data = (await response.json()) as { choices: { message: { content: string } }[] };
      const content = data.choices[0]?.message.content;
      if (!content) throw new Error('empty reply');
      return JSON.parse(content) as T;
    } catch (error) {
      lastError = error;
      console.warn(
        `  attempt ${attempt} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
  throw lastError;
}

// --- The chapter's shape -----------------------------------------------------------

type Line = { speaker: 'A' | 'B'; text: string; meaning: string };
type Scene = { partnerRole: string; learnerRole: string; brief: string; goal: string };
type DraftLesson = {
  title: string;
  items: { text: string; meaning: string; example: string; exampleMeaning: string }[];
  tip: string;
  dialogue: Line[];
  scenario: Scene;
};
type DraftChapter = {
  title: string;
  lessons: DraftLesson[];
  review: { title: string; dialogue: Line[]; scenario: Scene };
};

const object = (properties: Record<string, object>) => ({
  type: 'object',
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const string = { type: 'string' };
const lineSchema = object({
  speaker: { type: 'string', enum: ['A', 'B'] },
  text: string,
  meaning: string,
});
const sceneSchema = object({
  partnerRole: string,
  learnerRole: string,
  brief: string,
  goal: string,
});
const chapterSchema = object({
  title: string,
  lessons: {
    type: 'array',
    items: object({
      title: string,
      items: {
        type: 'array',
        items: object({ text: string, meaning: string, example: string, exampleMeaning: string }),
      },
      tip: string,
      dialogue: { type: 'array', items: lineSchema },
      scenario: sceneSchema,
    }),
  },
  review: object({
    title: string,
    dialogue: { type: 'array', items: lineSchema },
    scenario: sceneSchema,
  }),
});

function shapeProblems(chapter: DraftChapter): string[] {
  const problems: string[] = [];
  if (chapter.lessons.length !== DAYS - 1) {
    problems.push(`expected ${DAYS - 1} lessons, got ${chapter.lessons.length}`);
  }
  chapter.lessons.forEach((lesson, i) => {
    if (lesson.items.length < 5 || lesson.items.length > 8) {
      problems.push(`lesson ${i + 1}: ${lesson.items.length} items`);
    }
    if (lesson.dialogue.length < 4 || lesson.dialogue.length > 10) {
      problems.push(`lesson ${i + 1}: ${lesson.dialogue.length} dialogue lines`);
    }
  });
  if (chapter.review.dialogue.length < 4 || chapter.review.dialogue.length > 10) {
    problems.push('review dialogue length');
  }
  const seen = new Set<string>();
  for (const lesson of chapter.lessons) {
    for (const item of lesson.items) {
      const key = item.text.trim().toLowerCase();
      if (seen.has(key)) problems.push(`"${item.text}" twice`);
      seen.add(key);
    }
  }
  return problems;
}

// --- Pass 1: writing ------------------------------------------------------------------

async function writeChapter(
  course: CourseLanguage,
  number: number,
  earlierItems: string[],
): Promise<DraftChapter> {
  const language = COURSE_LANGUAGES[course];
  const plan = SYLLABUS[number - 1]!;
  const system = [
    `You write a beginner ${language} course (CEFR A1 rising to A2) for adults who speak English.`,
    `Everything being taught — items, examples, dialogue lines — is in ${language}.`,
    'Everything that explains it — titles, meanings, tips, roles, briefs, goals — is in plain English.',
    'Use natural, everyday, correct language. Short sentences. No slang, no rare idioms.',
    'Nothing unsafe, political, religious, romantic or culturally insensitive. Names are varied and international.',
    'Quality rules:',
    '(1) Every item is something a beginner will really say or hear, useful on its own.',
    '(2) Each example uses the item with exactly the meaning given, and each meaning is the natural English equivalent.',
    '(3) Dialogues sound like real people talking.',
    '(4) Line B is the learner: avoid lines where B must state their own gender (prefer forms that work for anyone).',
    `(5) In a tip, quote every ${language} word you explain in single quotes, e.g. Use 'Guten Morgen' in the morning.`,
    "(6) Respect the language's grammar from the start: articles, gender, formal and informal address where it has them.",
  ].join(' ');
  const user = [
    `Chapter ${number} of 12: "${plan.theme}". Focus: ${plan.focus}.`,
    'Write exactly 4 daily lessons that build on each other, in "lessons" (exactly 4 entries),',
    'and separately a review day for the whole chapter, in "review" only — never as a fifth lesson.',
    'Each lesson:',
    '- title: short and friendly, in English.',
    `- items: 6 words or short phrases new in this lesson, each with its English meaning, one simple ${language} example sentence using it, and that example in English.`,
    '- tip: one short grammar or usage note (2–3 sentences) in English, for a beginner.',
    `- dialogue: 6 alternating lines between A (the other person) and B (the learner) in ${language}, each with its English meaning, using the items.`,
    '- scenario, in English: partnerRole and learnerRole are short descriptions;',
    `  brief tells the AI partner how to play the scene in ${language} in 2–3 sentences (stay simple, use this lesson's words, one question at a time);`,
    '  goal is one sentence telling the learner what to achieve, addressed as "you".',
    'The review: an English title, a 6–8 line dialogue mixing the whole chapter, and a scenario that combines it.',
    earlierItems.length
      ? `Do not repeat these items from earlier chapters: ${earlierItems.join('; ')}.`
      : 'This is the first chapter.',
  ].join('\n');

  let feedback = '';
  for (let attempt = 1; attempt <= 4; attempt++) {
    const chapter = await ask<DraftChapter>(system, user + feedback, 'chapter', chapterSchema, 0.5);
    // The model sometimes repeats the review as an empty fifth lesson; it
    // already has its own place, so the copy is dropped.
    if (chapter.lessons.length === DAYS && chapter.lessons[DAYS - 1]?.items.length === 0) {
      chapter.lessons = chapter.lessons.slice(0, DAYS - 1);
    }
    const problems = shapeProblems(chapter);
    if (!problems.length) return chapter;
    console.warn(`  off-shape (${problems.join(', ')}), asking again`);
    // Said back plainly, so the next attempt fixes exactly this.
    feedback = [
      '',
      `Your previous attempt had these problems: ${problems.join('; ')}.`,
      'Every item in the 4 lessons must be a different word or phrase — never the same item in two lessons.',
      "Use the earlier lessons' items in later dialogues instead of teaching them again.",
    ].join('\n');
  }
  throw new Error('The chapter did not come back in shape after 4 tries.');
}

// --- Pass 2: native editing ---------------------------------------------------------

async function editChapter(course: CourseLanguage, draft: DraftChapter): Promise<DraftChapter> {
  const language = COURSE_LANGUAGES[course];
  const system = [
    `You are a native ${language} editor and language teacher checking a beginner course for English speakers.`,
    `Correct every ${language} error: grammar, spelling, accents, articles, gender, word order, and anything unnatural.`,
    'Make sure each English meaning matches its item or line exactly, and each example uses its item.',
    `Keep tips accurate, with the ${language} words they explain in single quotes.`,
    'Change only what is wrong. Keep the same structure, the same number of entries, and the same order.',
  ].join(' ');
  const edited = await ask<DraftChapter>(
    system,
    JSON.stringify(draft),
    'chapter',
    chapterSchema,
    0,
  );
  const problems = shapeProblems(edited);
  if (problems.length) {
    console.warn(`  the edit changed the shape (${problems.join(', ')}); keeping the draft`);
    return draft;
  }
  return edited;
}

/** How many texts the edit changed, for the log. */
function changes(before: DraftChapter, after: DraftChapter): number {
  const texts = (chapter: DraftChapter) =>
    JSON.stringify(chapter).match(/"(?:[^"\\]|\\.)*"/g) ?? [];
  const a = texts(before);
  const b = texts(after);
  return a.reduce((count, text, i) => count + (text === b[i] ? 0 : 1), 0);
}

// --- Assembly ----------------------------------------------------------------------------

const pad = (n: number) => String(n).padStart(2, '0');
const chapterFile = (course: string, number: number) =>
  join(COURSE_DIR, course, `chapter-${pad(number)}.json`);
const workFile = (course: string, number: number) =>
  join(WORK_DIR, course, `chapter-${pad(number)}.work.json`);

function assemble(number: number, chapter: DraftChapter) {
  const id = `c${pad(number)}`;
  const dayOf = (d: number) => (number - 1) * DAYS + d;

  const lessons: object[] = chapter.lessons.map((lesson, l) => {
    const lessonId = `${id}-d${l + 1}`;
    return {
      id: lessonId,
      day: dayOf(l + 1),
      title: lesson.title,
      checkpoint: false,
      items: lesson.items.map((item, i) => ({ id: `${lessonId}-i${i + 1}`, ...item })),
      tip: lesson.tip,
      dialogue: lesson.dialogue,
      scenario: lesson.scenario,
    };
  });
  lessons.push({
    id: `${id}-d${DAYS}`,
    day: dayOf(DAYS),
    title: chapter.review.title,
    checkpoint: true,
    items: [],
    dialogue: chapter.review.dialogue,
    scenario: chapter.review.scenario,
  });

  return { id, number, title: chapter.title, lessons };
}

/** Rewrites the list of courses the app imports, from the chapter files on disk. */
function writeCourseList() {
  const courses = (Object.keys(COURSE_LANGUAGES) as CourseLanguage[])
    .map((course) => {
      const dir = join(COURSE_DIR, course);
      const numbers = existsSync(dir)
        ? readdirSync(dir)
            .map((name) => /^chapter-(\d\d)\.json$/.exec(name)?.[1])
            .filter((n): n is string => Boolean(n))
            .sort()
        : [];
      return { course, numbers };
    })
    .filter(({ numbers }) => numbers.length > 0);

  const name = (course: string, n: string) => `${course.replace(/\W/g, '')}${n}`;
  const lines = [
    '// Generated by server/scripts/generate-course.mts. Do not edit by hand.',
    '/* eslint-disable import/order -- courses in the order the app lists them */',
    "import type { Course, CourseChapter } from './types';",
    '',
    ...courses.flatMap(({ course, numbers }) =>
      numbers.map((n) => `import ${name(course, n)} from './${course}/chapter-${n}.json';`),
    ),
    '',
    '/** Every course that ships, in the order the app lists them, with the chapters written so far. */',
    'export const COURSES: readonly Course[] = [',
    ...courses.map(
      ({ course, numbers }) =>
        `  { id: '${course}', chapters: [${numbers
          .map((n) => `${name(course, n)} as unknown as CourseChapter`)
          .join(', ')}] },`,
    ),
    '];',
    '',
  ];
  writeFileSync(join(COURSE_DIR, 'courses.ts'), lines.join('\n'));
}

/** Every item already taught in this course, so a new chapter does not teach it again. */
function earlierItems(course: string, before: number): string[] {
  const items: string[] = [];
  for (let n = 1; n < before; n++) {
    if (!existsSync(workFile(course, n))) continue;
    const chapter = JSON.parse(readFileSync(workFile(course, n), 'utf8')) as DraftChapter;
    for (const lesson of chapter.lessons) items.push(...lesson.items.map((item) => item.text));
  }
  return items;
}

// --- Main --------------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const course = args[args.indexOf('--course') + 1] as CourseLanguage;
  const number = Number(args[args.indexOf('--chapter') + 1]);
  if (
    !(course in COURSE_LANGUAGES) ||
    !Number.isInteger(number) ||
    number < 1 ||
    number > SYLLABUS.length
  ) {
    throw new Error(
      `Usage: node scripts/generate-course.mts --course <${Object.keys(COURSE_LANGUAGES).join('|')}> --chapter <1-12> [--force]`,
    );
  }
  const force = args.includes('--force');
  if (existsSync(chapterFile(course, number)) && !force) {
    console.log(`${course} chapter ${number} exists. Use --force to write it again.`);
    writeCourseList();
    return;
  }

  console.log(`${course} chapter ${number}: writing with ${MODEL}…`);
  const draft = await writeChapter(course, number, earlierItems(course, number));
  console.log('  editing as a native speaker…');
  const edited = await editChapter(course, draft);
  console.log(`  edit: ${changes(draft, edited)} texts corrected`);

  mkdirSync(join(WORK_DIR, course), { recursive: true });
  writeFileSync(workFile(course, number), JSON.stringify(edited, null, 1));
  mkdirSync(join(COURSE_DIR, course), { recursive: true });
  writeFileSync(chapterFile(course, number), JSON.stringify(assemble(number, edited), null, 1));
  writeCourseList();
  console.log(`Done: ${chapterFile(course, number)}`);
  console.log('Now run `npm run check` in the app folder to validate it.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
