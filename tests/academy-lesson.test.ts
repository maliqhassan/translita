import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { courseChapters, courseLessons, type CourseItem } from '@/features/academy/course';
import {
  blankOf,
  coreOf,
  isGraded,
  itemsOf,
  planLesson,
  SECTIONS,
  sectionCounts,
  seededRandom,
  sentenceMatches,
  shuffle,
  speechMatches,
} from '@/features/academy/lesson/plan';
import { isSessionState, outcomeOf, updatedStats } from '@/features/academy/lesson/session';

const chapter = courseChapters('de')[0]!;
const dayOne = chapter.lessons[0]!;
const checkpoint = chapter.lessons[4]!;
const chapterItems = chapter.lessons.flatMap((lesson) => lesson.items);
const byId = new Map<string, CourseItem>(chapterItems.map((item) => [item.id, item]));

const plan = (over: Partial<Parameters<typeof planLesson>[0]> = {}) =>
  planLesson({
    lesson: dayOne,
    pool: chapterItems,
    review: [],
    minutesPerDay: 5,
    seed: 'seed',
    ...over,
  });

describe('planning a lesson', () => {
  it('is the same lesson every time from the same seed', () => {
    assert.deepEqual(plan(), plan());
    assert.notDeepEqual(plan({ seed: 'a' }), plan({ seed: 'b' }));
  });

  it('shows the day first, meets every word, then the tip, and ends on the conversation', () => {
    const steps = plan();
    assert.equal(steps[0]?.kind, 'overview');
    const learns = steps.filter((step) => step.kind === 'learn');
    assert.equal(learns.length, dayOne.items.length);
    assert.deepEqual(
      steps.slice(1, dayOne.items.length + 1).map((step) => step.kind),
      dayOne.items.map(() => 'learn'),
    );
    assert.equal(steps[dayOne.items.length + 1]?.kind, 'tip');
    assert.equal(steps.at(-2)?.kind, 'dialogue');
    assert.equal(steps.at(-1)?.kind, 'roleplay');
  });

  it('practises every word of the day', () => {
    const practised = new Set(
      plan()
        .filter(isGraded)
        .flatMap((step) => itemsOf(step)),
    );
    for (const item of dayOne.items) assert.ok(practised.has(item.id), item.text);
  });

  it('gives a serious learner more practice than a casual one', () => {
    const casual = plan().filter(isGraded).length;
    const serious = plan({ minutesPerDay: 15 }).filter(isGraded).length;
    assert.ok(serious > casual, `${serious} > ${casual}`);
  });

  it('never offers two right answers', () => {
    for (const step of plan({ minutesPerDay: 15 })) {
      if (step.kind !== 'choose' && step.kind !== 'listen') continue;
      assert.ok(step.options.includes(step.itemId));
      const meanings = step.options.map((id) => byId.get(id)!.meaning.toLowerCase());
      const texts = step.options.map((id) => byId.get(id)!.text.toLowerCase());
      assert.equal(new Set(meanings).size, meanings.length, 'two options mean the same');
      assert.equal(new Set(texts).size, texts.length, 'two options read the same');
    }
  });

  it('builds a sentence from its own words, never already in order', () => {
    for (const step of plan({ minutesPerDay: 15 })) {
      if (step.kind !== 'build') continue;
      const example = byId.get(step.itemId)!.example;
      assert.deepEqual([...step.words].sort(), example.split(/\s+/).filter(Boolean).sort());
      assert.notEqual(step.words.join(' '), example);
    }
  });

  it('adds due review words, more for a serious learner', () => {
    const later = courseLessons('de')[1]!;
    const review = dayOne.items.slice(0, 5);
    const count = (minutes: number) =>
      planLesson({
        lesson: later,
        pool: chapterItems,
        review,
        minutesPerDay: minutes,
        seed: 's',
      }).filter(
        (step) =>
          step.section === 'review' &&
          step.kind !== 'match' &&
          itemsOf(step).some((id) => review.some((item) => item.id === id)),
      ).length;
    assert.ok(count(5) >= 3);
    assert.ok(count(15) >= count(5));
  });

  it('quizzes the chapter on a checkpoint, teaching nothing new', () => {
    const steps = plan({ lesson: checkpoint });
    assert.equal(
      steps.some((step) => step.kind === 'learn' || step.kind === 'tip'),
      false,
    );
    assert.ok(steps.filter(isGraded).length >= 10);
    assert.equal(steps.at(-2)?.kind, 'dialogue');
    assert.equal(steps.at(-1)?.kind, 'roleplay');
  });
});

describe('the parts of a lesson', () => {
  it('runs through the sections in order, never going back', () => {
    for (const lesson of [dayOne, checkpoint]) {
      const order = plan({ lesson, review: dayOne.items.slice(0, 4) }).map((step) =>
        SECTIONS.indexOf(step.section),
      );
      assert.deepEqual(
        order,
        [...order].sort((a, b) => a - b),
        lesson.title,
      );
    }
  });

  it('counts the steps in each section, all but the overview', () => {
    const steps = plan();
    const counts = sectionCounts(steps);
    assert.equal(
      SECTIONS.reduce((sum, section) => sum + counts[section], 0),
      steps.length - 1,
    );
    assert.equal(counts.conversation, 2);
    assert.ok(counts.speak > 0);
  });

  it('matches pairs more than once, more for a serious learner', () => {
    const matches = (minutes: number) =>
      plan({ minutesPerDay: minutes }).filter((step) => step.kind === 'match');
    assert.ok(matches(5).length >= 2);
    assert.ok(matches(15).length >= matches(5).length);
    for (const step of matches(15)) {
      assert.ok(step.itemIds.length >= 3);
      assert.equal(new Set(step.itemIds).size, step.itemIds.length);
    }
  });

  it('fills gaps that the word really leaves, with one right answer', () => {
    const fills = plan({ minutesPerDay: 15 }).filter((step) => step.kind === 'fill');
    assert.ok(fills.length >= 3);
    for (const step of fills) {
      if (step.kind !== 'fill') continue;
      const item = byId.get(step.itemId)!;
      const gap = blankOf(item);
      assert.ok(gap, item.text);
      assert.equal(gap.before + coreOf(item.text) + gap.after, item.example);
      assert.ok(step.options.includes(step.itemId));
      const words = step.options.map((id) => coreOf(byId.get(id)!.text).toLowerCase());
      assert.equal(new Set(words).size, words.length);
    }
  });

  it('has the learner say words and whole sentences out loud', () => {
    const says = plan().filter((step) => step.kind === 'say');
    assert.ok(says.some((step) => step.kind === 'say' && step.what === 'word'));
    assert.ok(says.some((step) => step.kind === 'say' && step.what === 'sentence'));
    assert.ok(says.every((step) => step.section === 'speak'));
  });
});

describe('checking answers', () => {
  it('accepts a sentence in the right order, whatever the punctuation and case', () => {
    assert.equal(sentenceMatches(['ich', 'bin', 'Anna'], 'Ich bin Anna.'), true);
    assert.equal(sentenceMatches(['bin', 'ich', 'Anna'], 'Ich bin Anna.'), false);
  });

  it('accepts speech that has most of the words', () => {
    assert.equal(speechMatches('guten morgen', 'Guten Morgen!'), true);
    assert.equal(speechMatches('ich bin anna heute', 'Ich bin Anna.'), true);
    assert.equal(speechMatches('hallo', 'Wie geht es dir?'), false);
    assert.equal(speechMatches('', 'Hallo'), false);
  });

  it('shuffles reproducibly from a seed', () => {
    assert.deepEqual(
      shuffle([1, 2, 3, 4, 5], seededRandom('x')),
      shuffle([1, 2, 3, 4, 5], seededRandom('x')),
    );
  });
});

describe('a lesson result', () => {
  it('scores the marked steps, and completes a day by finishing it', () => {
    const result = outcomeOf(
      [
        { step: 1, correct: true },
        { step: 2, correct: false },
      ],
      false,
    );
    assert.equal(result.score, 0.5);
    assert.equal(result.stars, 1);
    assert.equal(result.passed, true);
  });

  it('passes a checkpoint only at 70%', () => {
    const answers = (right: number, of: number) =>
      Array.from({ length: of }, (_, i) => ({ step: i, correct: i < right }));
    assert.equal(outcomeOf(answers(6, 10), true).passed, false);
    assert.equal(outcomeOf(answers(7, 10), true).passed, true);
  });

  it('counts a lesson with nothing marked as complete', () => {
    assert.deepEqual(outcomeOf([], false), {
      score: 1,
      stars: 3,
      passed: true,
      correct: 0,
      total: 0,
    });
  });

  it('updates every tested word, and only those', () => {
    const steps = plan();
    const graded = steps.findIndex((step) => step.kind === 'choose' || step.kind === 'listen');
    const stats = updatedStats('de', steps, [{ step: graded, correct: true }], new Map(), 1000);
    assert.equal(stats.length, 1);
    assert.equal(stats[0]?.box, 1);
    assert.equal(stats[0]?.courseId, 'de');
  });

  it('recognises a saved lesson in progress, and rejects anything else', () => {
    assert.equal(
      isSessionState({ seed: 's', reviewIds: [], answers: [{ step: 1, correct: true }] }),
      true,
    );
    assert.equal(isSessionState({ seed: 's', reviewIds: [], answers: [{ step: 'x' }] }), false);
    assert.equal(isSessionState(null), false);
  });
});
