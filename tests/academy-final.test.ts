import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { courseChapters } from '@/features/academy/course';
import { FINAL_SCENE, courseItems, finalLesson } from '@/features/academy/course/final';
import { isFinalReport, localReport, type FinalReport } from '@/features/academy/final-report';
import { isGraded, itemsOf, planFinal, planLesson, skillOf } from '@/features/academy/lesson/plan';
import {
  FINAL_RULES,
  canRetake,
  estimateLevel,
  finalUnlocked,
  rubricScore,
  skillAccuracy,
  strongestItems,
} from '@/features/academy/rules';
import {
  createBackendCoachService,
  toAssessment,
  toReport,
  type CoachRubric,
} from '@/services/coach';
import type { HttpClient, HttpRequest } from '@/services/http';
import type { ItemStat } from '@/types';
import { ok } from '@/utils';

/**
 * The final exam: Part A built from the whole course, Part B marked on a
 * fixed rubric by the server, the level decided here, and a report that
 * reads the same with or without the AI's prose.
 */

const code = (file: string) => readFileSync(file, 'utf8');
const items = courseItems('de');
const marks: CoachRubric = { vocabulary: 4, grammar: 3, fluency: 4, comprehension: 4, task: 4 };
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 13, 12);

describe('Part A, written and listening', () => {
  const steps = planFinal(items, FINAL_RULES.questions, 'seed');

  it('asks the set number of questions, all marked, none spoken', () => {
    assert.equal(steps.length, FINAL_RULES.questions);
    assert.ok(steps.every(isGraded));
    assert.equal(
      steps.some((step) => step.kind === 'say'),
      false,
    );
    assert.equal(steps.filter((step) => step.kind === 'match').length, 2);
  });

  it('is the same exam from the same seed, and another from another', () => {
    assert.deepEqual(planFinal(items, 40, 'a'), planFinal(items, 40, 'a'));
    assert.notDeepEqual(planFinal(items, 40, 'a'), planFinal(items, 40, 'b'));
  });

  it('draws only on words the course teaches', () => {
    const known = new Set(items.map((item) => item.id));
    for (const step of steps) for (const id of itemsOf(step)) assert.ok(known.has(id), id);
  });

  it('names a skill for every question', () => {
    for (const step of steps) assert.ok(skillOf(step), step.kind);
  });

  it('is shaped as a lesson the step screens can show', () => {
    const lesson = finalLesson('de', 'x');
    assert.equal(lesson.scenario, FINAL_SCENE);
    assert.equal(lesson.items.length, 12);
  });
});

describe('the exam rules', () => {
  it('scores the conversation as every mark out of 5, together', () => {
    assert.equal(rubricScore(marks), 19 / 25);
    assert.equal(rubricScore({}), 0);
  });

  it('decides the level here, never by the model', () => {
    assert.equal(estimateLevel(0.65, 0.9), 'A1');
    assert.equal(estimateLevel(0.9, 0.6), 'A1');
    assert.equal(estimateLevel(0.75, 0.76), 'A2');
    assert.equal(estimateLevel(0.92, 0.88), 'A2+');
  });

  it('lets a failed part be taken again from the next day', () => {
    assert.equal(canRetake(undefined, NOW), true);
    assert.equal(canRetake(NOW - 60_000, NOW), false);
    assert.equal(canRetake(NOW - DAY, NOW), true);
  });

  it('opens once every day is done, or every shipped day in a build being written', () => {
    const all = new Set(Array.from({ length: 60 }, (_, i) => i + 1));
    const five = new Set([1, 2, 3, 4, 5]);
    assert.equal(finalUnlocked(all, 1, 60, false), true);
    assert.equal(finalUnlocked(five, 1, 5, false), false);
    assert.equal(finalUnlocked(five, 1, 5, true), true);
    assert.equal(finalUnlocked(new Set([1, 2, 3]), 1, 5, true), false);
  });

  it('measures accuracy per skill', () => {
    assert.deepEqual(
      skillAccuracy([
        { skill: 'listening', correct: true },
        { skill: 'listening', correct: false },
        { skill: 'grammar', correct: true },
      ]),
      { listening: 0.5, grammar: 1 },
    );
  });

  it('names the best-known words first', () => {
    const stat = (itemId: string, box: number, correct: number): ItemStat => ({
      courseId: 'de',
      itemId,
      correct,
      wrong: 0,
      box,
      lastSeenAt: 0,
      nextReviewAt: 0,
    });
    assert.deepEqual(
      strongestItems([stat('a', 3, 2), stat('b', 6, 9), stat('c', 1, 1)], 5).map((s) => s.itemId),
      ['b', 'a'],
    );
  });
});

describe('a missed checkpoint', () => {
  it('starts the retry with the words it missed', () => {
    const chapter = courseChapters('de')[0]!;
    const pool = chapter.lessons.flatMap((lesson) => lesson.items);
    const missed = pool.slice(-3);
    const steps = planLesson({
      lesson: chapter.lessons[4]!,
      pool,
      review: missed,
      minutesPerDay: 5,
      seed: 'retry',
    });
    const quizzed = steps.filter((step) => step.section === 'practise' && step.kind !== 'match');
    assert.deepEqual(
      quizzed.slice(0, 3).flatMap(itemsOf).sort(),
      missed.map((item) => item.id).sort(),
    );
  });
});

describe('the report', () => {
  const report: FinalReport = {
    courseId: 'de',
    level: 'A2',
    writtenScore: 0.82,
    spokenScore: 0.76,
    rubric: { ...marks, grammar: 2 },
    skills: { listening: 0.9, grammar: 0.6 },
    feedback: 'Good.',
    written: null,
    strongWords: ['Hallo'],
    weakWords: ['Bahnhof'],
    daysDone: 60,
    wordsKnown: 200,
    completedAt: NOW,
  };

  it('writes plain text from the numbers when the AI could not', () => {
    const plain = localReport(report);
    assert.ok(plain.summary.includes('82%'));
    assert.ok(plain.strengths.some((line) => line.includes('90%')));
    assert.ok(plain.weaknesses.some((line) => line.includes('60%')));
    assert.ok(plain.weaknesses.some((line) => line.includes('2 of 5')));
    assert.ok(plain.suggestions.length >= 2);
  });

  it('reads back only a report this build can show', () => {
    assert.equal(isFinalReport(report), true);
    assert.equal(isFinalReport({ ...report, rubric: undefined }), false);
    assert.equal(isFinalReport(null), false);
  });
});

describe('marking and the report, over the server', () => {
  function fakeHttp(data: unknown) {
    const sent: HttpRequest[] = [];
    const http: HttpClient = {
      async send(request) {
        sent.push(request);
        return ok({ status: 200, ok: true, data });
      },
    };
    return { http, sent };
  }

  it('posts the conversation for marking, and reads five marks back', async () => {
    const { http, sent } = fakeHttp({ rubric: marks, feedback: 'Gut.' });
    const coach = createBackendCoachService({
      baseUrl: 'https://api.example',
      path: '/academy/roleplay',
      assessPath: '/academy/assess',
      http,
      userId: async () => undefined,
    });
    const result = await coach.assess({
      learning: 'de',
      scene: FINAL_SCENE,
      transcript: [{ role: 'learner', text: 'Hallo' }],
    });
    assert.equal(sent[0]?.url, 'https://api.example/academy/assess');
    assert.equal(result.ok && result.value.rubric.grammar, 3);
  });

  it('refuses marks out of range, and a report without a summary', () => {
    assert.equal(toAssessment({ rubric: { ...marks, task: 6 } }), undefined);
    assert.equal(toAssessment({ rubric: { vocabulary: 3 } }), undefined);
    assert.equal(toReport({ strengths: [] }), undefined);
    assert.equal(toReport({ summary: 'S' })?.strengths.length, 0);
  });

  it('asks for the longer conversation only in the exam', async () => {
    const { http, sent } = fakeHttp({ kind: 'reply', reply: 'Hallo', correction: null });
    const coach = createBackendCoachService({
      baseUrl: 'https://api.example',
      path: '/academy/roleplay',
      http,
      userId: async () => undefined,
    });
    const scene = FINAL_SCENE;
    const base = { learning: 'de', scene, words: [], heard: '', history: [] } as const;
    await coach.roleplay({ ...base, addressAs: 'unspecified' });
    await coach.roleplay({ ...base, addressAs: 'unspecified', final: true });
    assert.equal((sent[0]?.body as { final?: boolean }).final, undefined);
    assert.equal((sent[1]?.body as { final?: boolean }).final, true);
  });
});

describe('the exam screens', () => {
  it('have one-line routes, registered in the stack', () => {
    assert.equal(
      code('app/academy/final.tsx').trim(),
      "export { FinalExamScreen as default } from '@/features/academy';",
    );
    assert.equal(
      code('app/academy/report.tsx').trim(),
      "export { ReportScreen as default } from '@/features/academy';",
    );
    const layout = code('app/_layout.tsx');
    assert.ok(layout.includes('name="academy/final"'));
    assert.ok(layout.includes('name="academy/report"'));
  });

  it('save each part as it is marked, and the report and completion at the end', () => {
    const screen = code('src/features/academy/screens/final-exam-screen.tsx');
    assert.ok(screen.includes("kind: 'final_written'"));
    assert.ok(screen.includes("kind: 'final_conversation'"));
    assert.ok(screen.includes("kind: 'report'"));
    assert.ok(screen.includes('await enroll({ ...enrollment, completedAt: at });'));
    assert.ok(screen.includes('estimateLevel(written.score, spoken.score)'));
  });

  it('share the certificate through the sharing service alone', () => {
    assert.ok(
      code('src/features/academy/screens/report-screen.tsx').includes(
        'services.sharing.shareView(',
      ),
    );
    const sharing = code('src/services/sharing/expo-share-service.ts');
    assert.ok(sharing.includes("from 'react-native-view-shot'"));
    assert.ok(sharing.includes("from 'expo-sharing'"));
  });
});
