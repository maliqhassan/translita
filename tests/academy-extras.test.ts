import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ELITE_PLAN } from '@/constants';
import { courseChapters } from '@/features/academy/course';
import { courseItems } from '@/features/academy/course/final';
import { itemsOf, planPlacement, planPractice } from '@/features/academy/lesson/plan';
import { buildReminders } from '@/features/academy/reminders';
import {
  BADGES,
  chapterOfItem,
  REMINDER_DAYS,
  earnedBadges,
  longestStreak,
  mistakeItems,
  placementStart,
  reminderTimes,
  shouldRedo,
} from '@/features/academy/rules';
import { capabilitiesFor } from '@/services/entitlements';
import type { ItemStat, LessonProgress } from '@/types';

/**
 * What keeps a learner going: practising mistakes, badges, and reminders that
 * respect them. All rules here, so the screens only show what they decide.
 */

const code = (file: string) => readFileSync(file, 'utf8');
const DAY = 24 * 60 * 60 * 1000;
const NOON = new Date(2026, 9, 13, 12).getTime();

const stat = (itemId: string, over: Partial<ItemStat> = {}): ItemStat => ({
  courseId: 'de',
  itemId,
  correct: 1,
  wrong: 0,
  box: 1,
  lastSeenAt: 0,
  nextReviewAt: 0,
  ...over,
});
const lesson = (day: number, over: Partial<LessonProgress> = {}): LessonProgress => ({
  courseId: 'de',
  lessonId: `d${day}`,
  day,
  score: 0.8,
  stars: 2,
  attempts: 1,
  completedAt: NOON - (10 - day) * DAY,
  ...over,
});

describe('practising mistakes', () => {
  it('collects what was got wrong and not yet mastered, most recent first', () => {
    const list = mistakeItems([
      stat('a', { wrong: 2, box: 1, lastSeenAt: 1 }),
      stat('b', { wrong: 1, box: 5 }),
      stat('c', { wrong: 0 }),
      stat('d', { wrong: 1, box: 2, lastSeenAt: 9 }),
    ]);
    assert.deepEqual(
      list.map((s) => s.itemId),
      ['d', 'a'],
    );
  });

  it('asks every word twice, two different ways', () => {
    const items = courseItems('de').slice(0, 5);
    const steps = planPractice(items, courseItems('de'), 'seed');
    for (const item of items) {
      const asked = steps.filter((step) => step.kind !== 'match' && itemsOf(step)[0] === item.id);
      assert.equal(asked.length, 2, item.text);
      assert.notDeepEqual(asked[0], asked[1]);
    }
    assert.equal(steps.filter((step) => step.kind === 'match').length, 1);
  });

  it('suggests doing a day again when most of it went wrong', () => {
    assert.equal(shouldRedo(3, 10), true);
    assert.equal(shouldRedo(7, 10), false);
    assert.equal(shouldRedo(0, 0), false);
  });
});

describe('badges', () => {
  it('counts the longest streak ever, not only the current one', () => {
    const at = (day: number) => NOON + day * DAY;
    assert.equal(longestStreak([at(0), at(1), at(2), at(5), at(6)]), 3);
    assert.equal(longestStreak([]), 0);
  });

  it('earns each badge from saved progress alone', () => {
    assert.deepEqual(earnedBadges({ progress: [], wordsKnown: 0, graduated: false }), []);
    const week = Array.from({ length: 7 }, (_, i) =>
      lesson(i + 1, { completedAt: NOON + i * DAY }),
    );
    const earned = earnedBadges({
      progress: [...week, lesson(8, { stars: 3 })],
      wordsKnown: 60,
      graduated: false,
    });
    for (const badge of ['first-day', 'streak-3', 'streak-7', 'perfect', 'chapter', 'words-50']) {
      assert.ok(earned.includes(badge as never), badge);
    }
    for (const badge of ['streak-30', 'halfway', 'words-150', 'graduate']) {
      assert.equal(earned.includes(badge as never), false, badge);
    }
  });

  it('lists every badge on the shelf, with how to earn it', () => {
    const shelf = code('src/features/academy/components/badges.tsx');
    for (const badge of BADGES)
      assert.ok(shelf.includes(`'${badge}'`) || shelf.includes(`${badge}:`));
  });
});

describe('reminders', () => {
  const hour = 19;

  it('plans a week ahead at the chosen hour', () => {
    const times = reminderTimes(NOON, hour, false);
    assert.equal(times.length, REMINDER_DAYS);
    assert.equal(new Date(times[0]!).getHours(), hour);
    assert.equal(new Date(times[0]!).getDate(), new Date(NOON).getDate());
  });

  it('skips today once today is done, or its hour has passed', () => {
    assert.equal(
      new Date(reminderTimes(NOON, hour, true)[0]!).getDate(),
      new Date(NOON + DAY).getDate(),
    );
    const late = new Date(2026, 9, 13, 21).getTime();
    assert.equal(new Date(reminderTimes(late, hour, false)[0]!).getDate(), 14);
  });

  it('mentions the streak first, and misses you after quiet days', () => {
    const plan = buildReminders(reminderTimes(NOON, hour, false), { day: 4, streak: 3 });
    assert.ok(plan[0]!.body.includes('3'));
    assert.ok(plan[3]!.body.includes('Fabalita'));
    assert.ok(plan.every((reminder) => reminder.title.includes('Fabalita')));
  });

  it('asks for permission only after a yes in the app, never at launch', () => {
    const offer = code('src/features/academy/components/reminder-offer.tsx');
    assert.ok(offer.includes('services.notifications.requestPermission()'));
    assert.ok(code('src/features/academy/screens/lesson-screen.tsx').includes('<ReminderOffer />'));
    for (const file of [
      'app/_layout.tsx',
      'src/features/academy/components/reminder-scheduler.tsx',
    ]) {
      assert.equal(code(file).includes('requestPermission'), false, file);
    }
  });

  it('imports the notifications library in one file only', () => {
    assert.ok(
      code('src/services/notifications/expo-notification-service.ts').includes(
        "from 'expo-notifications'",
      ),
    );
  });
});

describe('Fabalita', () => {
  it('is the coach everywhere, by one name', () => {
    assert.ok(code('src/features/academy/components/coach-avatar.tsx').includes('FABALITA.image'));
    assert.ok(code('src/features/academy/components/academy-fab.tsx').includes('FABALITA.image'));
    assert.ok(
      code('src/features/academy/screens/academy-onboarding.tsx').includes('<FabalitaHello />'),
    );
    assert.ok(code('src/features/academy/fabalita.ts').includes("name: 'Fabalita'"));
  });
});

describe('the practice screen', () => {
  it('has a one-line route, and is reached from a lesson and the dashboard', () => {
    assert.equal(
      code('app/academy/practice.tsx').trim(),
      "export { PracticeScreen as default } from '@/features/academy';",
    );
    assert.ok(code('app/_layout.tsx').includes('name="academy/practice"'));
    assert.ok(
      code('src/features/academy/screens/academy-screen.tsx').includes(
        'router.push(ACADEMY_PRACTICE)',
      ),
    );
    assert.ok(
      code('src/features/academy/screens/lesson-screen.tsx').includes('ACADEMY_PRACTICE as string'),
    );
  });
});

describe('the placement check', () => {
  const pass = (chapters: number[]) =>
    Array.from({ length: 12 }, (_, i) => ({ chapter: i + 1, correct: chapters.includes(i + 1) }));

  it('skips each pair of chapters answered entirely right, in order', () => {
    assert.equal(placementStart(pass([])), 1);
    assert.equal(placementStart(pass([1])), 1);
    assert.equal(placementStart(pass([1, 2])), 11);
    assert.equal(placementStart(pass([1, 2, 3, 4])), 21);
    // A pair missed stops the climb, whatever comes after.
    assert.equal(placementStart(pass([1, 2, 4, 5, 6])), 11);
  });

  it('never starts anyone past chapter 9, so the course still has work in it', () => {
    assert.equal(placementStart(pass([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])), 41);
  });

  it('asks one question per chapter, easiest chapter first', () => {
    const chapters = courseChapters('de').map((chapter) => ({
      number: chapter.number,
      items: chapter.lessons.flatMap((lesson) => lesson.items),
    }));
    const steps = planPlacement(chapters, 'seed');
    assert.equal(steps.length, 12);
    assert.deepEqual(
      steps.map((step) => chapterOfItem(itemsOf(step)[0]!)),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    );
  });

  it('is offered in onboarding only to someone who knows some of the language', () => {
    const onboarding = code('src/features/academy/screens/academy-onboarding.tsx');
    assert.ok(onboarding.includes("...(level === 'some' ? ['placement' as const] : [])"));
    assert.ok(onboarding.includes("startDay: level === 'some' ? (startDay ?? 1) : 1"));
  });
});

describe('what Elite is', () => {
  it('costs $4.99 a month, and is the Academy plus an ad-free translator', () => {
    assert.equal(ELITE_PLAN.displayPrice, '$4.99');
    assert.ok(capabilitiesFor('elite').has('academy'));
    assert.ok(capabilitiesFor('elite').has('adFree'));
    // Paying only for the ad-free translator does not open Fabalita.
    assert.ok(capabilitiesFor('pro').has('adFree'));
    assert.equal(capabilitiesFor('pro').has('academy'), false);
  });
});

describe('matching rounds', () => {
  it('never put two cards that read the same in one round', () => {
    for (const course of ['de', 'fr', 'es', 'it', 'pt-BR', 'sv']) {
      for (const chapter of courseChapters(course)) {
        const items = chapter.lessons.flatMap((lesson) => lesson.items);
        const byId = new Map(items.map((item) => [item.id, item]));
        const steps = planPractice(items.slice(0, 10), items, `${course}:${chapter.number}`);
        for (const step of steps) {
          if (step.kind !== 'match') continue;
          const meanings = step.itemIds.map((id) => byId.get(id)!.meaning.toLowerCase().trim());
          assert.equal(new Set(meanings).size, meanings.length, `${course} ${chapter.number}`);
        }
      }
    }
  });
});
