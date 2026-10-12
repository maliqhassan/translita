import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { courseLessons, findLesson, lessonForDay } from '@/features/academy/course';

const code = (file: string) => readFileSync(file, 'utf8');
const FAB = 'src/features/academy/components/academy-fab.tsx';
const ONBOARDING = 'src/features/academy/screens/academy-onboarding.tsx';
const ACADEMY = 'src/features/academy/screens/academy-screen.tsx';
const LESSON = 'src/features/academy/screens/lesson-screen.tsx';
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
  it('asks which language to learn first, taught from English', () => {
    const screen = code(ONBOARDING);
    assert.ok(screen.includes("t('Which language do you want to learn?')"));
    assert.ok(screen.includes("t('Every lesson is explained in English.')"));
    assert.ok(screen.includes("baseLanguage: 'en'"));
    assert.ok(screen.indexOf("'course',") < screen.indexOf("'goal',"));
  });

  it('then asks why, how much, and how long, naming the language', () => {
    const screen = code(ONBOARDING);
    for (const question of [
      "t('Why are you learning {language}?', { language })",
      "t('How much {language} do you know?', { language })",
      "t('How much time each day?')",
    ]) {
      assert.ok(screen.includes(question), question);
    }
    assert.ok(screen.includes('void enroll({'));
  });

  it('asks how to address the learner only where the language needs it', () => {
    const screen = code(ONBOARDING);
    assert.ok(
      screen.includes("const GENDERED: readonly string[] = ['de', 'fr', 'es', 'it', 'pt-BR'];"),
    );
    assert.ok(screen.includes("...(asksAddress ? ['address' as const] : [])"));
  });

  it('cannot go on without an answer, and can always go back or leave', () => {
    const screen = code(ONBOARDING);
    assert.ok(screen.includes('disabled={!answered[step]}'));
    assert.ok(screen.includes("BackHandler.addEventListener('hardwareBackPress'"));
  });
});

describe('the Academy dashboard', () => {
  it('shows onboarding until enrolled, then the dashboard, on one route', () => {
    assert.ok(code(ACADEMY).includes('if (!enrollment) return <AcademyOnboarding'));
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

  it('switches between courses and adds another language', () => {
    const screen = code(ACADEMY);
    assert.ok(screen.includes('onPress={() => void openCourse(course.courseId)}'));
    assert.ok(screen.includes('exclude={enrolled.map((course) => course.courseId)}'));
  });
});

describe('the lesson player', () => {
  it('saves its place after every step and resumes from it', () => {
    const screen = code(LESSON);
    assert.ok(screen.includes('void services.academy.savePosition({'));
    assert.ok(screen.includes('saved.lessonId === lesson.id && isSessionState(saved.state)'));
    // With its length, so the dashboard and the way in can show today's progress.
    assert.ok(screen.includes('total: steps.length'));
  });

  it('records the day, the words and the checkpoint at the end, then clears its place', () => {
    const screen = code(LESSON);
    assert.ok(screen.includes('if (result.passed) {'));
    assert.ok(screen.includes('await services.academy.saveItemStats('));
    assert.ok(screen.includes("kind: 'checkpoint'"));
    assert.ok(screen.includes('await services.academy.clearPosition(courseId);'));
  });
});

describe('finding lessons', () => {
  it('finds a lesson by id and by day, per course', () => {
    for (const courseId of ['de', 'fr', 'es']) {
      const first = courseLessons(courseId)[0];
      assert.ok(first, courseId);
      assert.equal(findLesson(courseId, first.id)?.day, 1);
      assert.equal(lessonForDay(courseId, 1)?.id, 'c01-d1');
    }
    assert.equal(findLesson('de', 'c99-d9'), undefined);
    assert.equal(courseLessons('xx').length, 0);
  });
});
