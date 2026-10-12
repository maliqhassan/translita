import type { CourseItem, CourseLesson } from '../course';

/**
 * One step of a lesson.
 *
 * Exercises are built here, from the items, rather than stored in the course:
 * the content stays small and an exercise can never disagree with its item.
 */
export type LessonStep =
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
  /** Say a word out loud. */
  | { kind: 'say'; itemId: string }
  /** Read and listen through the day's conversation. */
  | { kind: 'dialogue' };

export type GradedKind = 'choose' | 'listen' | 'build' | 'match' | 'say';

/** Whether a step is marked right or wrong, and so counts towards the score. */
export function isGraded(step: LessonStep): step is Extract<LessonStep, { kind: GradedKind }> {
  return ['choose', 'listen', 'build', 'match', 'say'].includes(step.kind);
}

/** The items a graded step tests, for the word records. */
export function itemsOf(step: LessonStep): readonly string[] {
  if (step.kind === 'match') return step.itemIds;
  return 'itemId' in step ? [step.itemId] : [];
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

type ExerciseKind = 'choose-meaning' | 'listen' | 'choose-word' | 'build' | 'say';

function exercise(
  kind: ExerciseKind,
  item: CourseItem,
  pool: readonly CourseItem[],
  random: () => number,
): LessonStep | undefined {
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
    case 'say':
      return { kind: 'say', itemId: item.id };
  }
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
 * The steps of one lesson.
 *
 * A learning day: meet each word, read the tip, practise each word in a mix of
 * exercises, match, review earlier words that are due, then the conversation.
 * A serious learner gets a second round of practice, every word said aloud,
 * and more review. A checkpoint teaches nothing: it quizzes the chapter, then
 * runs the review conversation.
 */
export function planLesson({ lesson, pool, review, minutesPerDay, seed }: PlanInput): LessonStep[] {
  const random = seededRandom(seed);
  const serious = minutesPerDay >= 15;
  const steps: LessonStep[] = [];
  const add = (step: LessonStep | undefined) => {
    if (step) steps.push(step);
  };

  if (lesson.checkpoint) {
    const quizzed = shuffle(pool, random).slice(0, serious ? 16 : 10);
    const kinds: ExerciseKind[] = ['choose-meaning', 'listen', 'choose-word', 'build'];
    quizzed.forEach((item, i) => {
      add(
        exercise(kinds[i % kinds.length]!, item, pool, random) ??
          exercise('choose-meaning', item, pool, random),
      );
    });
    if (quizzed.length >= 4)
      add({ kind: 'match', itemIds: quizzed.slice(0, 4).map((item) => item.id) });
    add({ kind: 'dialogue' });
    return steps;
  }

  const items = lesson.items;
  for (const item of items) add({ kind: 'learn', itemId: item.id });
  if (lesson.tip) add({ kind: 'tip' });

  // One round of practice for everyone, a second for a serious learner, each
  // word in a different exercise each round.
  const firstRound: ExerciseKind[] = ['choose-meaning', 'listen', 'choose-word'];
  const secondRound: ExerciseKind[] = ['build', 'choose-word', 'listen'];
  shuffle(items, random).forEach((item, i) =>
    add(exercise(firstRound[i % firstRound.length]!, item, pool, random)),
  );
  if (items.length >= 4) {
    add({
      kind: 'match',
      itemIds: shuffle(items, random)
        .slice(0, 4)
        .map((item) => item.id),
    });
  }
  if (serious) {
    shuffle(items, random).forEach((item, i) =>
      add(
        exercise(secondRound[i % secondRound.length]!, item, pool, random) ??
          exercise('choose-meaning', item, pool, random),
      ),
    );
  } else {
    // A casual learner still builds one sentence.
    const buildable = items.find((item) => scrambled(item.example, random));
    if (buildable) add(exercise('build', buildable, pool, random));
  }
  const spoken = serious ? items : items.slice(0, 2);
  for (const item of spoken) add({ kind: 'say', itemId: item.id });

  for (const item of review.slice(0, serious ? 8 : 3)) {
    add(exercise('choose-meaning', item, pool, random));
  }

  add({ kind: 'dialogue' });
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
  const want = normalize(expected).split(' ').filter(Boolean);
  const got = new Set(normalize(heard).split(' ').filter(Boolean));
  if (!want.length) return false;
  const found = want.filter((word) => got.has(word)).length;
  return found / want.length >= 0.6;
}
