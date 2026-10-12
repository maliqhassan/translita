import type { CourseItem, CourseLesson } from '../course';

/**
 * The parts of a lesson, in order, as the learner sees them: shown on the
 * overview before it starts, and as a bar while it runs.
 */
export const SECTIONS = ['learn', 'practise', 'speak', 'review', 'conversation'] as const;
export type Section = (typeof SECTIONS)[number];

/**
 * What one step of a lesson does.
 *
 * Exercises are built here, from the items, rather than stored in the course:
 * the content stays small and an exercise can never disagree with its item.
 */
export type StepBody =
  /** What today holds, before it starts. */
  | { kind: 'overview' }
  /** Meet a new word: the word, its meaning, an example, and its sound. */
  | { kind: 'learn'; itemId: string }
  /** The day's grammar or usage note. */
  | { kind: 'tip' }
  /** Pick the English meaning of a word, or the word for an English meaning. */
  | { kind: 'choose'; itemId: string; ask: 'meaning' | 'word'; options: readonly string[] }
  /** Hear a word and pick it. */
  | { kind: 'listen'; itemId: string; options: readonly string[] }
  /** Put the example sentence back in order. */
  | { kind: 'build'; itemId: string; words: readonly string[] }
  /** Match words to their meanings. */
  | { kind: 'match'; itemIds: readonly string[] }
  /** The example sentence with the word left out: pick what goes in the gap. */
  | { kind: 'fill'; itemId: string; options: readonly string[] }
  /** Say a word, or a whole example sentence, out loud. */
  | { kind: 'say'; itemId: string; what: 'word' | 'sentence' }
  /** The day's conversation: listen to the other person, say your own lines. */
  | { kind: 'dialogue' }
  /** Play the scene with the AI partner, when there is a connection. */
  | { kind: 'roleplay' };

export type LessonStep = StepBody & { section: Section };

export type GradedKind = 'choose' | 'listen' | 'build' | 'match' | 'fill' | 'say';

/** Whether a step tests particular words, and so updates their review records. */
export function isGraded(step: LessonStep): step is Extract<LessonStep, { kind: GradedKind }> {
  return ['choose', 'listen', 'build', 'match', 'fill', 'say'].includes(step.kind);
}

/** The items a graded step tests, for the word records. */
export function itemsOf(step: LessonStep): readonly string[] {
  if (step.kind === 'match') return step.itemIds;
  return 'itemId' in step ? [step.itemId] : [];
}

/** How many steps of each section a lesson has, for its overview. */
export function sectionCounts(steps: readonly LessonStep[]): Record<Section, number> {
  const counts: Record<Section, number> = {
    learn: 0,
    practise: 0,
    speak: 0,
    review: 0,
    conversation: 0,
  };
  for (const step of steps) if (step.kind !== 'overview') counts[step.section]++;
  return counts;
}

// --- Seeded randomness ------------------------------------------------------------
// A lesson is planned from a seed, so leaving and coming back rebuilds exactly
// the same steps, in the same order, with the same options.

function hash(seed: string): number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

/** mulberry32: small, fast and good enough to shuffle a few options. */
export function seededRandom(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

// --- Building blocks -------------------------------------------------------------------

const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[.,!?¿¡;:"'«»“”‘’()…-]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

/** A phrase without its "…" or closing punctuation: "Ich heiße..." → "Ich heiße". */
export function coreOf(text: string): string {
  return text
    .replace(/(\.{2,}|…)\s*$/u, '')
    .replace(/[.!?]+$/u, '')
    .trim();
}

/**
 * Up to three wrong answers for an item, never one that would also be right:
 * no item with the same text or the same meaning.
 */
function distractors(item: CourseItem, pool: readonly CourseItem[], random: () => number) {
  const candidates = pool.filter(
    (other) =>
      other.id !== item.id &&
      normalize(other.text) !== normalize(item.text) &&
      normalize(other.meaning) !== normalize(item.meaning),
  );
  // Keep the options distinct from each other too.
  const chosen: CourseItem[] = [];
  for (const other of shuffle(candidates, random)) {
    const clash = chosen.some(
      (picked) =>
        normalize(picked.text) === normalize(other.text) ||
        normalize(picked.meaning) === normalize(other.meaning),
    );
    if (!clash) chosen.push(other);
    if (chosen.length === 3) break;
  }
  return chosen;
}

function options(item: CourseItem, pool: readonly CourseItem[], random: () => number) {
  return shuffle([item, ...distractors(item, pool, random)], random).map((option) => option.id);
}

/** The example's words, shuffled so the order is never already right. */
function scrambled(example: string, random: () => number): string[] | undefined {
  const words = example.split(/\s+/).filter(Boolean);
  if (words.length < 3 || words.length > 9) return undefined;
  for (let attempt = 0; attempt < 5; attempt++) {
    const order = shuffle(words, random);
    if (order.join(' ') !== words.join(' ')) return order;
  }
  return undefined;
}

/**
 * The example sentence split around the item, for a fill-in-the-gap, or
 * undefined when the item does not appear in its own example as written.
 */
export function blankOf(item: CourseItem): { before: string; after: string } | undefined {
  const core = coreOf(item.text);
  if (core.length < 2) return undefined;
  const at = item.example.toLowerCase().indexOf(core.toLowerCase());
  if (at < 0) return undefined;
  return { before: item.example.slice(0, at), after: item.example.slice(at + core.length) };
}

type ExerciseKind = 'choose-meaning' | 'listen' | 'choose-word' | 'build' | 'fill';

function exercise(
  kind: ExerciseKind,
  item: CourseItem,
  pool: readonly CourseItem[],
  random: () => number,
): StepBody | undefined {
  switch (kind) {
    case 'choose-meaning':
      return {
        kind: 'choose',
        itemId: item.id,
        ask: 'meaning',
        options: options(item, pool, random),
      };
    case 'choose-word':
      return { kind: 'choose', itemId: item.id, ask: 'word', options: options(item, pool, random) };
    case 'listen':
      return { kind: 'listen', itemId: item.id, options: options(item, pool, random) };
    case 'build': {
      const words = scrambled(item.example, random);
      return words ? { kind: 'build', itemId: item.id, words } : undefined;
    }
    case 'fill':
      return blankOf(item)
        ? { kind: 'fill', itemId: item.id, options: options(item, pool, random) }
        : undefined;
  }
}

/** Groups of four for matching, each a different mix, as many as asked for. */
function matchRounds(items: readonly CourseItem[], rounds: number, random: () => number) {
  if (items.length < 4) return [];
  const sets: string[][] = [];
  for (let round = 0; round < rounds; round++) {
    sets.push(
      shuffle(items, random)
        .slice(0, 4)
        .map((item) => item.id),
    );
  }
  return sets;
}

// --- The plan ---------------------------------------------------------------------------

export type PlanInput = {
  lesson: CourseLesson;
  /**
   * Items to draw wrong answers from and, for a checkpoint, to quiz: the
   * chapter's items, plus earlier ones.
   */
  pool: readonly CourseItem[];
  /** Words due for review from earlier days, most urgent first. */
  review: readonly CourseItem[];
  /** 5 (casual) or 15 (serious): how much practice and review. */
  minutesPerDay: number;
  seed: string;
};

/**
 * The steps of one lesson, in five parts.
 *
 * - **Learn**: meet each new word, then the tip.
 * - **Practise**: each word in a mix of exercises — choosing, listening,
 *   filling the gap, building a sentence — and matching rounds.
 * - **Speak**: say the words, then whole sentences.
 * - **Review**: earlier words that are due.
 * - **Conversation**: the day's dialogue, saying your own lines, then the scene
 *   with the AI partner.
 *
 * A serious learner gets more of everything. A checkpoint teaches nothing: it
 * quizzes the chapter, has the learner say its sentences, and ends on the
 * review conversation.
 */
export function planLesson({ lesson, pool, review, minutesPerDay, seed }: PlanInput): LessonStep[] {
  const random = seededRandom(seed);
  const serious = minutesPerDay >= 15;
  const steps: LessonStep[] = [];
  const add = (section: Section, body: StepBody | undefined) => {
    if (body) steps.push({ ...body, section });
  };
  const either = (first: StepBody | undefined, fallback: () => StepBody | undefined) =>
    first ?? fallback();

  add('learn', { kind: 'overview' });

  if (lesson.checkpoint) {
    // A retry after a miss starts with the words missed; the rest at random.
    const focus = new Set(review.map((item) => item.id));
    const quizzed = [
      ...pool.filter((item) => focus.has(item.id)),
      ...shuffle(
        pool.filter((item) => !focus.has(item.id)),
        random,
      ),
    ].slice(0, serious ? 16 : 10);
    const kinds: ExerciseKind[] = ['choose-meaning', 'fill', 'listen', 'choose-word', 'build'];
    quizzed.forEach((item, i) =>
      add(
        'practise',
        either(exercise(kinds[i % kinds.length]!, item, pool, random), () =>
          exercise('choose-meaning', item, pool, random),
        ),
      ),
    );
    for (const itemIds of matchRounds(pool, 2, random)) add('practise', { kind: 'match', itemIds });
    for (const item of shuffle(pool, random).slice(0, serious ? 4 : 2)) {
      add('speak', { kind: 'say', itemId: item.id, what: 'sentence' });
    }
    add('conversation', { kind: 'dialogue' });
    add('conversation', { kind: 'roleplay' });
    return steps;
  }

  const items = lesson.items;

  // Learn.
  for (const item of items) add('learn', { kind: 'learn', itemId: item.id });
  if (lesson.tip) add('learn', { kind: 'tip' });

  // Practise: one round for everyone, each word in a different exercise; a
  // second round for a serious learner; then matching and the gaps.
  const firstRound: ExerciseKind[] = ['choose-meaning', 'listen', 'choose-word'];
  shuffle(items, random).forEach((item, i) =>
    add('practise', exercise(firstRound[i % firstRound.length]!, item, pool, random)),
  );
  const matches = matchRounds(items, serious ? 3 : 2, random);
  add('practise', matches[0] ? { kind: 'match', itemIds: matches[0] } : undefined);

  const fillable = shuffle(items, random).filter((item) => blankOf(item));
  for (const item of fillable.slice(0, serious ? fillable.length : 3)) {
    add('practise', exercise('fill', item, pool, random));
  }
  if (serious) {
    const secondRound: ExerciseKind[] = ['build', 'choose-word', 'listen'];
    shuffle(items, random).forEach((item, i) =>
      add(
        'practise',
        either(exercise(secondRound[i % secondRound.length]!, item, pool, random), () =>
          exercise('choose-meaning', item, pool, random),
        ),
      ),
    );
  } else {
    // A casual learner still builds one sentence.
    const buildable = items.find((item) => scrambled(item.example, random));
    if (buildable) add('practise', exercise('build', buildable, pool, random));
  }
  for (const itemIds of matches.slice(1)) add('practise', { kind: 'match', itemIds });

  // Speak: the words, then whole sentences.
  for (const item of serious ? items : items.slice(0, 3)) {
    add('speak', { kind: 'say', itemId: item.id, what: 'word' });
  }
  for (const item of shuffle(items, random).slice(0, serious ? 3 : 1)) {
    add('speak', { kind: 'say', itemId: item.id, what: 'sentence' });
  }

  // Review: earlier words that are due, in a mix, with a match when there are enough.
  const due = review.slice(0, serious ? 8 : 3);
  const reviewKinds: ExerciseKind[] = ['choose-meaning', 'fill', 'listen'];
  due.forEach((item, i) =>
    add(
      'review',
      either(exercise(reviewKinds[i % reviewKinds.length]!, item, pool, random), () =>
        exercise('choose-meaning', item, pool, random),
      ),
    ),
  );
  for (const itemIds of matchRounds(due, 1, random)) add('review', { kind: 'match', itemIds });

  // Conversation.
  add('conversation', { kind: 'dialogue' });
  add('conversation', { kind: 'roleplay' });
  return steps;
}

// --- Checking answers ----------------------------------------------------------------------

/** Whether the words put in order make the example. Punctuation and case do not count. */
export function sentenceMatches(answer: readonly string[], example: string): boolean {
  return normalize(answer.join(' ')) === normalize(example);
}

/**
 * Whether what the recogniser heard is close enough to what was to be said.
 *
 * Recognisers drop small words, add articles and spell numbers their own way,
 * so a beginner is not marked wrong for that: most of the expected words have
 * to be there, in any order.
 */
export function speechMatches(heard: string, expected: string): boolean {
  const want = normalize(coreOf(expected)).split(' ').filter(Boolean);
  const got = new Set(normalize(heard).split(' ').filter(Boolean));
  if (!want.length) return false;
  const found = want.filter((word) => got.has(word)).length;
  return found / want.length >= 0.6;
}

// --- The final exam ------------------------------------------------------------------------

/**
 * Part A of the final exam: questions across the whole course.
 *
 * The same exercises the lessons use — the meaning, the word, listening,
 * filling the gap, building a sentence — over words drawn from every
 * chapter, and two matching rounds. Nothing spoken: speaking is Part B.
 * Seeded like a lesson, so a part-way exam rebuilds the same questions.
 */
export function planFinal(items: readonly CourseItem[], count: number, seed: string): LessonStep[] {
  const random = seededRandom(seed);
  const steps: LessonStep[] = [];
  const matches = matchRounds(items, 2, random);
  const singles = Math.max(0, count - matches.length);
  const kinds: ExerciseKind[] = [
    'choose-meaning',
    'listen',
    'fill',
    'choose-word',
    'build',
    'listen',
    'fill',
    'choose-meaning',
  ];
  // Every word once before any twice; a short course goes round again, and the
  // kinds cycle on, so a word asked twice is asked a different way.
  const quizzed: CourseItem[] = [];
  while (items.length && quizzed.length < singles) quizzed.push(...shuffle(items, random));
  quizzed.length = Math.min(quizzed.length, singles);
  quizzed.forEach((item, i) => {
    const body =
      exercise(kinds[i % kinds.length]!, item, items, random) ??
      exercise('choose-meaning', item, items, random);
    if (body) steps.push({ ...body, section: 'practise' });
  });
  // The matching rounds a third and two thirds of the way through.
  matches.forEach((itemIds, i) => {
    steps.splice(Math.round((steps.length * (i + 1)) / 3), 0, {
      kind: 'match',
      itemIds,
      section: 'practise',
    });
  });
  return steps;
}

/** The skill a question tests, for the report; undefined for steps that are not questions. */
export function skillOf(
  step: LessonStep,
): 'reading' | 'vocabulary' | 'listening' | 'grammar' | undefined {
  switch (step.kind) {
    case 'choose':
      return step.ask === 'meaning' ? 'reading' : 'vocabulary';
    case 'match':
      return 'vocabulary';
    case 'listen':
      return 'listening';
    case 'fill':
    case 'build':
      return 'grammar';
    default:
      return undefined;
  }
}
