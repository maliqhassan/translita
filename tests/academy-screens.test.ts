import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  courseLessons,
  findLesson,
  inBase,
  isBaseLanguage,
  lessonForDay,
} from '@/features/academy/course';

const code = (file: string) => readFileSync(file, 'utf8');
const FAB = 'src/features/academy/components/academy-fab.tsx';
const ONBOARDING = 'src/features/academy/screens/academy-onboarding.tsx';
const ACADEMY = 'src/features/academy/screens/academy-screen.tsx';
const TRANSLATE = 'src/features/translation/screens/translate-screen.tsx';

describe('the way into the Academy', () => {
  it('floats over the Translate screen, outside its scroll', () => {
    const screen = code(TRANSLATE);
    assert.ok(screen.includes('<AcademyFab />'));
    assert.ok(screen.lastIndexOf('</Screen>') < screen.indexOf('<AcademyFab />'));
    assert.ok(code(FAB).includes("position: 'absolute'"));
  });

  it('opens a card first, then goes to the Academy', () => {
    const fab = code(FAB);
    assert.ok(fab.includes('setOpen((value) => !value)'));
    assert.ok(fab.includes('router.push(ACADEMY_HOME)'));
    assert.ok(fab.includes("t('Continue learning')"));
  });

  it('has its routes as one-line files', () => {
    assert.equal(
      code('app/academy/index.tsx').trim(),
      "export { AcademyScreen as default } from '@/features/academy';",
    );
    assert.equal(
      code('app/academy/lesson/[id].tsx').trim(),
      "export { LessonScreen as default } from '@/features/academy';",
    );
    const layout = code('app/_layout.tsx');
    assert.ok(layout.includes('name="academy/index"'));
    assert.ok(layout.includes('name="academy/lesson/[id]"'));
  });
});

describe('the Academy onboarding', () => {
  it('asks why, which language, how much, and how long, then builds the course', () => {
    const screen = code(ONBOARDING);
    for (const question of [
      'Why are you learning English?',
      'Which language do you speak?',
      'How much English do you know?',
      'How much time each day?',
    ]) {
      assert.ok(screen.includes(`t('${question}')`), question);
    }
    assert.ok(screen.includes("t('Building your course…')"));
    assert.ok(screen.includes('void enroll({'));
  });

  it('asks how to address the learner only where the language needs it', () => {
    const screen = code(ONBOARDING);
    assert.ok(screen.includes("const GENDERED: readonly string[] = ['ur', 'hi', 'ar'];"));
    assert.ok(screen.includes("...(asksAddress ? ['address' as const] : [])"));
  });

  it('prefills the language from the app, but never offers English as the base', () => {
    const screen = code(ONBOARDING);
    assert.ok(screen.includes('isBaseLanguage(appLanguage) ? appLanguage : undefined'));
    assert.ok(screen.includes("exclude={['en']}"));
  });

  it('cannot go on without an answer, and can always go back or leave', () => {
    const screen = code(ONBOARDING);
    assert.ok(screen.includes('disabled={!answered[step]}'));
    assert.ok(screen.includes("BackHandler.addEventListener('hardwareBackPress'"));
    assert.ok(screen.includes("accessibilityLabel={t('Back to Translator')} onPress={onClose}"));
  });
});

describe('the Academy dashboard', () => {
  it('shows onboarding until enrolled, then the dashboard, on one route', () => {
    const screen = code(ACADEMY);
    assert.ok(screen.includes('if (!enrollment) return <AcademyOnboarding'));
  });

  it('has a way back to the translator in its header', () => {
    assert.ok(code(ACADEMY).includes("accessibilityLabel={t('Back to Translator')}"));
  });

  it('opens days by the shared rules, and stops at the paywall and locks', () => {
    const screen = code(ACADEMY);
    assert.ok(screen.includes('dayStatus(day, done, enrollment.startDay, unlocked)'));
    assert.ok(screen.includes("if (status === 'paywalled')"));
    assert.ok(screen.includes("if (status === 'locked')"));
  });
});

describe('finding lessons', () => {
  it('finds a lesson by id and by day, across the shipped chapters', () => {
    const first = courseLessons('en')[0];
    assert.ok(first);
    assert.equal(findLesson('en', first.id)?.day, 1);
    assert.equal(lessonForDay('en', 1)?.id, 'c01-d1');
    assert.equal(findLesson('en', 'c99-d9'), undefined);
    assert.equal(courseLessons('xx').length, 0);
  });

  it('shows course text in the learner language, or the English without one', () => {
    const lesson = lessonForDay('en', 1)!;
    assert.equal(inBase(lesson.titleMeaning, 'ur', lesson.title), lesson.titleMeaning.ur);
    assert.equal(inBase(lesson.titleMeaning, 'en', lesson.title), lesson.title);
    assert.equal(isBaseLanguage('en'), false);
    assert.equal(isBaseLanguage('fil'), true);
  });
});
