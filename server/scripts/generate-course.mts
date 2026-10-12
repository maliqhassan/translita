/**
 * Writes the English course, one chapter at a time, with gpt-4o-mini.
 *
 * Run from `server/`, with OPENAI_API_KEY in `server/.env`:
 *
 *   node scripts/generate-course.mts --chapter 1
 *   node scripts/generate-course.mts --chapter 1 --force        # write it again
 *   node scripts/generate-course.mts --chapter 1 --translate    # only fill missing translations
 *
 * The course is written once, reviewed, and shipped inside the app — this is
 * the only place a model writes lessons. Two passes per chapter:
 *
 * 1. English content: titles, words and phrases with example sentences, a
 *    tip, a scripted dialogue and a role-play brief for each day, following a
 *    fixed syllabus so chapters build on each other.
 * 2. Translations: every learner-facing English string into the 11 other app
 *    languages, one request per language, as key/value pairs checked back
 *    against the keys asked for.
 *
 * The output lands in `src/features/academy/course/en/` and the chapter list
 * is regenerated. The English draft and the raw translations are kept apart in
 * `server/course-work/`, so a run can resume and nothing extra ships in the app. The app's tests then check every chapter fully
 * (`validateChapter`), so `npm run check` is the final word on a file.
 *
 * SECURITY: the key is read from `server/.env` and only ever sent to OpenAI.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(here, '..', '..', 'src', 'features', 'academy', 'course', 'en');
/** The English draft and its translations, kept for resuming and re-runs; never shipped. */
const WORK_DIR = join(here, '..', 'course-work', 'en');

try {
  process.loadEnvFile(join(here, '..', '.env'));
} catch {
  // No .env: the key may already be in the environment.
}

const API_KEY = process.env.OPENAI_API_KEY?.trim();
const MODEL = process.env.COURSE_MODEL?.trim() || process.env.TUTOR_MODEL?.trim() || 'gpt-4o-mini';

/** The app's languages other than English, with the names the model is told. */
const BASE_LANGUAGES = {
  ur: 'Urdu',
  hi: 'Hindi',
  ar: 'Arabic (Modern Standard)',
  bn: 'Bengali',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  pt: 'Brazilian Portuguese',
  id: 'Indonesian',
  tr: 'Turkish',
  fil: 'Filipino (Tagalog)',
} as const;
type BaseLanguage = keyof typeof BASE_LANGUAGES;

/** The syllabus: what each chapter is about and what it teaches. A1 → A2. */
const SYLLABUS = [
  {
    theme: 'Greetings and introductions',
    focus: 'to be, I/you/he/she, "My name is", "Nice to meet you", where are you from',
  },
  {
    theme: 'At the café',
    focus: '"Can I have…", please and thank you, numbers 1–20, food and drink words',
  },
  {
    theme: 'Shopping',
    focus: '"How much is/are…", this/that/these, numbers to 100, colours and sizes',
  },
  {
    theme: 'Asking for directions',
    focus: 'Where is…?, imperatives (turn left, go straight), prepositions of place',
  },
  {
    theme: 'Getting around by transport',
    focus: 'present simple, telling the time, "When does the bus leave?", tickets',
  },
  {
    theme: 'At the airport',
    focus: '"I would like…", check-in and security words, questions with do/does',
  },
  { theme: 'At the hotel', focus: 'there is/there are, polite requests, reporting a problem' },
  { theme: 'At work', focus: 'present continuous, jobs and the office, meetings and schedules' },
  {
    theme: 'Health and the doctor',
    focus: '"I have a headache", body parts, should/shouldn\'t, at the pharmacy',
  },
  {
    theme: 'Phone calls and messages',
    focus: '"Could you…?", spelling names, leaving and taking a message',
  },
  { theme: 'Making plans', focus: 'going to / will, days and dates, invitations and replies' },
  {
    theme: 'Opinions and experiences',
    focus: 'past simple of common verbs, "I think…", likes and dislikes',
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

// --- Pass 1: English content ---------------------------------------------------

type EnglishLesson = {
  title: string;
  items: { text: string; example: string }[];
  tip: string;
  dialogue: { speaker: 'A' | 'B'; text: string }[];
  scenario: { partnerRole: string; learnerRole: string; brief: string; goal: string };
};
type EnglishChapter = {
  title: string;
  lessons: EnglishLesson[];
  review: {
    title: string;
    dialogue: EnglishLesson['dialogue'];
    scenario: EnglishLesson['scenario'];
  };
};

const dialogueSchema = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['speaker', 'text'],
    properties: { speaker: { type: 'string', enum: ['A', 'B'] }, text: { type: 'string' } },
  },
};
const scenarioSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['partnerRole', 'learnerRole', 'brief', 'goal'],
  properties: {
    partnerRole: { type: 'string' },
    learnerRole: { type: 'string' },
    brief: { type: 'string' },
    goal: { type: 'string' },
  },
};
const englishSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'lessons', 'review'],
  properties: {
    title: { type: 'string' },
    lessons: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'items', 'tip', 'dialogue', 'scenario'],
        properties: {
          title: { type: 'string' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'example'],
              properties: { text: { type: 'string' }, example: { type: 'string' } },
            },
          },
          tip: { type: 'string' },
          dialogue: dialogueSchema,
          scenario: scenarioSchema,
        },
      },
    },
    review: {
      type: 'object',
      additionalProperties: false,
      required: ['title', 'dialogue', 'scenario'],
      properties: { title: { type: 'string' }, dialogue: dialogueSchema, scenario: scenarioSchema },
    },
  },
};

function englishProblems(chapter: EnglishChapter): string[] {
  const problems: string[] = [];
  if (chapter.lessons.length !== DAYS - 1)
    problems.push(`expected ${DAYS - 1} lessons, got ${chapter.lessons.length}`);
  chapter.lessons.forEach((lesson, i) => {
    if (lesson.items.length < 5 || lesson.items.length > 8)
      problems.push(`lesson ${i + 1}: ${lesson.items.length} items`);
    if (lesson.dialogue.length < 4 || lesson.dialogue.length > 10)
      problems.push(`lesson ${i + 1}: ${lesson.dialogue.length} dialogue lines`);
  });
  if (chapter.review.dialogue.length < 4 || chapter.review.dialogue.length > 10)
    problems.push('review dialogue length');
  return problems;
}

async function writeEnglish(number: number, earlierItems: string[]): Promise<EnglishChapter> {
  const plan = SYLLABUS[number - 1]!;
  const system = [
    'You write a beginner English course (CEFR A1 rising to A2) for adults whose first language is not English.',
    'Use natural, everyday, neutral English. Short sentences. No slang, no idioms a beginner would not know.',
    'Nothing unsafe, political, religious, romantic or culturally insensitive. Names are varied and international.',
    'Quality rules:',
    '(1) Every item is something a beginner will really say or hear, useful on its own — no filler like "I am from here".',
    '(2) Each example uses the item with exactly the meaning being taught',
    '(e.g. "You\'re welcome" is the reply to "Thank you", never "You are welcome to join us").',
    '(3) Dialogues sound like real people talking: natural replies, no odd lines like "Nice to meet him".',
    '(4) Dialogue line B is the learner, so B never states their own gender in a way only one gender could say.',
    "(5) In a tip, quote every English word or phrase you explain in single quotes, e.g. Use 'He is' for a man.",
  ].join(' ');
  const user = [
    `Chapter ${number} of 12: "${plan.theme}". Grammar and vocabulary focus: ${plan.focus}.`,
    'Write exactly 4 daily lessons that build on each other, in "lessons" (exactly 4 entries),',
    'and separately a review day for the whole chapter, in "review" only — never as a fifth lesson.',
    'Each lesson:',
    '- title: short and friendly.',
    '- items: 6 words or short phrases that are new in this lesson, each with one simple example sentence using it.',
    '- tip: one short grammar or usage note (2–3 sentences) about this lesson, written for a beginner.',
    '- dialogue: 6 alternating lines between A (the other person) and B (the learner), using the items.',
    '- scenario: a role-play for an AI partner. partnerRole and learnerRole are short descriptions in English;',
    "  brief tells the AI partner how to play the scene in 2–3 sentences (stay simple, use this lesson's words, one question at a time);",
    '  goal is one sentence telling the learner what to achieve, addressed as "you".',
    'The review: title, a 6–8 line dialogue mixing the whole chapter, and a scenario that combines it.',
    earlierItems.length
      ? `Do not repeat these items from earlier chapters: ${earlierItems.join('; ')}.`
      : 'This is the first chapter.',
  ].join('\n');

  for (let attempt = 1; attempt <= 3; attempt++) {
    const chapter = await ask<EnglishChapter>(system, user, 'english_chapter', englishSchema, 0.5);
    // The model sometimes repeats the review as an empty fifth lesson; it
    // already has its own place, so the copy is dropped.
    if (chapter.lessons.length === DAYS && chapter.lessons[DAYS - 1]?.items.length === 0) {
      chapter.lessons = chapter.lessons.slice(0, DAYS - 1);
    }
    const problems = englishProblems(chapter);
    if (!problems.length) return chapter;
    console.warn(`  English content off-shape (${problems.join(', ')}), asking again`);
  }
  throw new Error('English content did not come back in shape after 3 tries.');
}

// --- Pass 2: translations --------------------------------------------------------

type Source = { key: string; text: string; kind: 'item' | 'sentence' | 'title' | 'tip' | 'goal' };

function sourcesOf(chapter: EnglishChapter): Source[] {
  const sources: Source[] = [{ key: 'title', text: chapter.title, kind: 'title' }];
  const addDialogue = (prefix: string, dialogue: EnglishLesson['dialogue']) =>
    dialogue.forEach((line, i) =>
      sources.push({ key: `${prefix}.d${i + 1}`, text: line.text, kind: 'sentence' }),
    );

  chapter.lessons.forEach((lesson, l) => {
    const p = `l${l + 1}`;
    sources.push({ key: `${p}.title`, text: lesson.title, kind: 'title' });
    lesson.items.forEach((item, i) => {
      sources.push({ key: `${p}.i${i + 1}`, text: item.text, kind: 'item' });
      sources.push({ key: `${p}.i${i + 1}.ex`, text: item.example, kind: 'sentence' });
    });
    sources.push({ key: `${p}.tip`, text: lesson.tip, kind: 'tip' });
    addDialogue(p, lesson.dialogue);
    sources.push({ key: `${p}.goal`, text: lesson.scenario.goal, kind: 'goal' });
  });
  const r = `l${DAYS}`;
  sources.push({ key: `${r}.title`, text: chapter.review.title, kind: 'title' });
  addDialogue(r, chapter.review.dialogue);
  sources.push({ key: `${r}.goal`, text: chapter.review.scenario.goal, kind: 'goal' });
  return sources;
}

const translationSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['translations'],
  properties: {
    translations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'text'],
        properties: { key: { type: 'string' }, text: { type: 'string' } },
      },
    },
  },
};

/**
 * Quoted English stays English.
 *
 * A tip explains English by quoting it — "Use 'He is' for a man" — and a
 * translation that translates the quote too says nothing ("use وہ ہے for a
 * man and وہ ہے for a woman"). Asking the model to leave quotes alone was not
 * enough, so each quote is swapped for a token the model cannot translate,
 * and put back afterwards. A translation that loses a token is rejected.
 */
const QUOTE = /(^|[\s(“"])'([^'\n]+?)'(?=[\s.,;:!?)”"]|$)|"([^"\n]+?)"/g;
const token = (n: number) => `⟦${n}⟧`;

type Protected = { text: string; quotes: string[] };

function protect(text: string): Protected {
  const quotes: string[] = [];
  const masked = text.replace(
    QUOTE,
    (match, lead: string | undefined, single?: string, double?: string) => {
      quotes.push(single ?? double ?? match);
      return `${lead ?? ''}${token(quotes.length)}`;
    },
  );
  return { text: masked, quotes };
}

/** The translation with the English put back, or null if a token went missing. */
function restore(translated: string, quotes: string[]): string | null {
  let result = translated;
  for (let n = 1; n <= quotes.length; n++) {
    if (!result.includes(token(n))) return null;
    result = result.split(token(n)).join(`'${quotes[n - 1]}'`);
  }
  return /⟦\d+⟧/.test(result) ? null : result;
}

async function translate(
  sources: Source[],
  language: BaseLanguage,
): Promise<Record<string, string>> {
  const name = BASE_LANGUAGES[language];
  const masked = new Map(sources.map((source) => [source.key, protect(source.text)]));
  const rules = [
    '"item" entries are English words or phrases being taught: give the natural equivalent a',
    `${name} speaker would use in the same situation, matching its grammar (a statement stays a`,
    'statement, a question stays a question, a fragment like "I am from" stays a fragment).',
    '"tip" entries explain English grammar to a beginner: explain it clearly in the target language.',
    'Tokens like ⟦1⟧ stand for English words being explained: copy every token exactly, once, in the',
    'right place, and never translate or remove them.',
  ].join(' ');

  // Pass 1: translate.
  const system = [
    `You translate a beginner English course into ${name} for learners whose first language is ${name}.`,
    'Translate the meaning naturally, as a native speaker would say it — not word for word.',
    rules,
    'Return every key exactly once, unchanged.',
  ].join(' ');

  const draft: Record<string, string> = {};
  let pending = sources;
  for (let attempt = 1; attempt <= 3 && pending.length; attempt++) {
    const reply = await ask<{ translations: { key: string; text: string }[] }>(
      system,
      JSON.stringify(pending.map(({ key, kind }) => ({ key, kind, text: masked.get(key)!.text }))),
      'translations',
      translationSchema,
      0.2,
    );
    for (const { key, text } of reply.translations) {
      const quotes = masked.get(key)?.quotes;
      if (!quotes || !pending.some((source) => source.key === key) || !text.trim()) continue;
      if (restore(text, quotes) !== null) draft[key] = text.trim();
    }
    pending = sources.filter((source) => !(source.key in draft));
    if (pending.length) console.warn(`  ${language}: ${pending.length} missing, asking again`);
  }
  if (pending.length)
    throw new Error(`${language}: still missing ${pending.map((s) => s.key).join(', ')}`);

  // Pass 2: proofread against the English, and correct only what is wrong.
  const reviewer = [
    `You are a careful native ${name} editor checking a translated beginner English course.`,
    'For each entry, compare the translation with the English. Correct it only if it is wrong,',
    'changes the meaning, is unnatural, or does not match the English grammar. Leave good ones out.',
    rules,
    'Return only the corrected entries, with their key.',
  ].join(' ');
  const corrections = await ask<{ translations: { key: string; text: string }[] }>(
    reviewer,
    JSON.stringify(
      sources.map(({ key, kind }) => ({
        key,
        kind,
        english: masked.get(key)!.text,
        translation: draft[key],
      })),
    ),
    'corrections',
    translationSchema,
    0,
  );
  let corrected = 0;
  for (const { key, text } of corrections.translations) {
    const quotes = masked.get(key)?.quotes;
    if (!quotes || !(key in draft) || !text.trim() || text.trim() === draft[key]) continue;
    if (restore(text, quotes) === null) continue;
    draft[key] = text.trim();
    corrected++;
  }
  if (corrected) console.log(`    proofread: ${corrected} corrected`);

  const result: Record<string, string> = {};
  for (const source of sources)
    result[source.key] = restore(draft[source.key]!, masked.get(source.key)!.quotes)!;
  return result;
}

// --- Assembly ----------------------------------------------------------------------

type Localized = Record<BaseLanguage, string>;
const pad = (n: number) => String(n).padStart(2, '0');
const fileFor = (number: number) => join(OUT_DIR, `chapter-${pad(number)}.json`);
const workFor = (number: number) => join(WORK_DIR, `chapter-${pad(number)}.work.json`);

type Work = {
  english: EnglishChapter;
  translations: Partial<Record<BaseLanguage, Record<string, string>>>;
};
const saveWork = (number: number, work: Work) => {
  mkdirSync(WORK_DIR, { recursive: true });
  writeFileSync(workFor(number), JSON.stringify(work, null, 1));
};

function assemble(
  number: number,
  english: EnglishChapter,
  translations: Partial<Record<BaseLanguage, Record<string, string>>>,
) {
  const loc = (key: string): Localized =>
    Object.fromEntries(
      (Object.keys(BASE_LANGUAGES) as BaseLanguage[]).map((code) => [
        code,
        translations[code]?.[key] ?? '',
      ]),
    ) as Localized;

  const id = `c${pad(number)}`;
  const dayOf = (d: number) => (number - 1) * DAYS + d;
  const dialogue = (prefix: string, lines: EnglishLesson['dialogue']) =>
    lines.map((line, i) => ({
      speaker: line.speaker,
      text: line.text,
      meaning: loc(`${prefix}.d${i + 1}`),
    }));
  const scenario = (prefix: string, s: EnglishLesson['scenario']) => ({
    partnerRole: s.partnerRole,
    learnerRole: s.learnerRole,
    brief: s.brief,
    goal: loc(`${prefix}.goal`),
  });

  const lessons: object[] = english.lessons.map((lesson, l) => {
    const p = `l${l + 1}`;
    const lessonId = `${id}-d${l + 1}`;
    return {
      id: lessonId,
      day: dayOf(l + 1),
      title: lesson.title,
      titleMeaning: loc(`${p}.title`),
      checkpoint: false,
      items: lesson.items.map((item, i) => ({
        id: `${lessonId}-i${i + 1}`,
        text: item.text,
        meaning: loc(`${p}.i${i + 1}`),
        example: item.example,
        exampleMeaning: loc(`${p}.i${i + 1}.ex`),
      })),
      tip: { text: lesson.tip, explanation: loc(`${p}.tip`) },
      dialogue: dialogue(p, lesson.dialogue),
      scenario: scenario(p, lesson.scenario),
    };
  });
  const r = `l${DAYS}`;
  lessons.push({
    id: `${id}-d${DAYS}`,
    day: dayOf(DAYS),
    title: english.review.title,
    titleMeaning: loc(`${r}.title`),
    checkpoint: true,
    items: [],
    dialogue: dialogue(r, english.review.dialogue),
    scenario: scenario(r, english.review.scenario),
  });

  return { id, number, title: english.title, titleMeaning: loc('title'), lessons };
}

/** Rewrites the chapter list the app imports, from the files on disk. */
function writeIndex() {
  const numbers = readdirSync(OUT_DIR)
    .map((name) => /^chapter-(\d\d)\.json$/.exec(name)?.[1])
    .filter((n): n is string => Boolean(n))
    .sort();
  const lines = [
    '// Generated by server/scripts/generate-course.ts. Do not edit by hand.',
    "import type { CourseChapter } from '../types';",
    '',
    ...numbers.map((n) => `import chapter${n} from './chapter-${n}.json';`),
    '',
    "/** The English course's chapters, in order. Only those generated so far. */",
    `export const ENGLISH_CHAPTERS: readonly CourseChapter[] = [${numbers
      .map((n) => `\n  chapter${n} as unknown as CourseChapter,`)
      .join('')}${numbers.length ? '\n' : ''}];`,
    '',
  ];
  writeFileSync(join(OUT_DIR, 'index.ts'), lines.join('\n'));
}

/** Every item already taught, so a new chapter does not teach it again. */
function earlierItems(before: number): string[] {
  const items: string[] = [];
  for (let n = 1; n < before; n++) {
    if (!existsSync(workFor(n))) continue;
    const chapter = JSON.parse(readFileSync(workFor(n), 'utf8')) as Work;
    for (const lesson of chapter.english.lessons)
      items.push(...lesson.items.map((item) => item.text));
  }
  return items;
}

// --- Main --------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const number = Number(args[args.indexOf('--chapter') + 1]);
  if (!Number.isInteger(number) || number < 1 || number > SYLLABUS.length) {
    throw new Error(
      'Usage: node scripts/generate-course.mts --chapter <1-12> [--force | --translate]',
    );
  }
  const force = args.includes('--force');
  const translateOnly = args.includes('--translate');
  const file = fileFor(number);
  const work = workFor(number);

  let english: EnglishChapter;
  let translations: Partial<Record<BaseLanguage, Record<string, string>>> = {};

  if (existsSync(work) && !force) {
    // A finished chapter is left alone unless asked; an interrupted one resumes.
    if (existsSync(file) && !translateOnly) {
      console.log(
        `Chapter ${number} exists. Use --force to write it again, or --translate to fill gaps.`,
      );
      return;
    }
    console.log(`Chapter ${number}: resuming from the saved draft…`);
    const saved = JSON.parse(readFileSync(work, 'utf8')) as Work;
    english = saved.english;
    translations = saved.translations;
  } else {
    console.log(`Chapter ${number}: writing English content with ${MODEL}…`);
    english = await writeEnglish(number, earlierItems(number));
    saveWork(number, { english, translations });
  }

  const sources = sourcesOf(english);
  for (const language of Object.keys(BASE_LANGUAGES) as BaseLanguage[]) {
    const have = translations[language] ?? {};
    if (sources.every((source) => have[source.key])) continue;
    console.log(`  translating into ${BASE_LANGUAGES[language]}…`);
    const missing = sources.filter((source) => !have[source.key]);
    translations[language] = { ...have, ...(await translate(missing, language)) };
    // Saved after every language, so an interruption loses one request, not eleven.
    saveWork(number, { english, translations });
  }

  writeFileSync(file, JSON.stringify(assemble(number, english, translations), null, 1));
  writeIndex();
  console.log(`Done: ${file}`);
  console.log('Now run `npm run check` in the app folder to validate it.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
