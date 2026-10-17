import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { PHRASE_CATEGORIES } from '@/features/phrases/phrase-catalog';
import { academyDayBand, logIfServerDown, noopAnalyticsService } from '@/services/analytics';
import {
  parseSavedPhrases,
  savedPhraseId,
  serializeSavedPhrases,
  type SavedPhrase,
} from '@/services/phrases';
import { addPhrase, removePhrase } from '@/store/saved-phrases-store';

/**
 * Saved phrases for travel, and the usage analytics added alongside them.
 */

const read = (path: string) => readFileSync(path, 'utf8');
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const phrase = (text: string, savedAt: number, target = 'de'): SavedPhrase => ({
  id: savedPhraseId(text, 'en', target),
  text,
  translation: `[${target}] ${text}`,
  sourceLanguage: 'en',
  targetLanguage: target,
  savedAt,
});

describe('the phrasebook', () => {
  it('has categories of real phrases, with no duplicates', () => {
    assert.ok(PHRASE_CATEGORIES.length >= 5);
    for (const category of PHRASE_CATEGORIES) {
      assert.ok(category.phrases.length >= 4, category.key);
      assert.equal(new Set(category.phrases).size, category.phrases.length, category.key);
    }
    const keys = PHRASE_CATEGORIES.map((category) => category.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  it('translates through the router, and writes nothing to history', () => {
    const hook = code('src/features/phrases/hooks/use-phrase-translations.ts');
    assert.match(hook, /services\.translation\.router\.translate\(/);
    assert.equal(hook.includes('history'), false);
  });
});

describe('saved phrases', () => {
  it('are one entry per phrase and pair, however often saved', () => {
    const first = phrase('Hello', 1);
    const again = { ...phrase('hello ', 2) };
    const list = addPhrase(addPhrase([], first), again);

    assert.equal(list.length, 1);
    assert.equal(list[0]?.savedAt, 2);
  });

  it('keep the same phrase in different languages apart', () => {
    const list = addPhrase(addPhrase([], phrase('Hello', 1, 'de')), phrase('Hello', 2, 'fr'));
    assert.equal(list.length, 2);
  });

  it('can be removed', () => {
    const list = addPhrase([], phrase('Hello', 1));
    assert.equal(removePhrase(list, savedPhraseId('Hello', 'en', 'de')).length, 0);
  });

  it('survive a round trip to storage, newest first', () => {
    const stored = serializeSavedPhrases([phrase('Old', 1), phrase('New', 5)]);
    const loaded = parseSavedPhrases(JSON.parse(stored));

    assert.deepEqual(
      loaded.map((item) => item.text),
      ['New', 'Old'],
    );
    assert.ok(loaded.every((item) => item.translation.length > 0));
  });

  it('drop anything malformed rather than failing the whole list', () => {
    const loaded = parseSavedPhrases({
      phrases: [{ text: 'Hi', translation: '' }, null, 'x', phrase('Good', 3)],
    });
    assert.deepEqual(
      loaded.map((item) => item.text),
      ['Good'],
    );
    assert.deepEqual(parseSavedPhrases('nonsense'), []);
  });

  it('are stored with their translation, so they work offline', () => {
    const screen = code('src/features/phrases/screens/phrases-screen.tsx');
    // The Saved tab reads the stored translation; it never translates again.
    assert.match(screen, /translation=\{phrase\.translation\}/);
  });

  it('can be saved straight from a translation on the home screen', () => {
    const card = code('src/features/translation/components/translation-result-card.tsx');
    assert.match(card, /phrase\.saved \? t\('Saved'\) : t\('Save'\)/);
    assert.match(
      code('src/features/translation/screens/translate-screen.tsx'),
      /phrases\.toggle\(\{/,
    );
  });

  it('has its own route, and a shortcut after AI Practice and Offline', () => {
    assert.ok(existsSync('app/phrases.tsx'));
    const screen = code('src/features/translation/screens/translate-screen.tsx');
    const offline = screen.indexOf("key: 'offline'");
    const phrases = screen.indexOf("key: 'phrases'");
    const practice = screen.indexOf("key: 'practice'");
    assert.ok(practice < offline && offline < phrases, 'Phrases comes after Practice and Offline');
  });
});

describe('usage analytics', () => {
  const EVENTS = 'src/services/analytics/analytics-service.ts';

  it('counts the Pro screen, Conversation by mode, and Practice', () => {
    assert.match(code('src/features/paywall/hooks/use-purchase.ts'), /name: 'paywall_view'/);
    assert.match(
      code('src/features/conversation/screens/conversation-screen.tsx'),
      /name: 'conversation_open',\s*params: \{ mode: mode === 'tutor' \? 'practice' : 'person' \}/,
    );
    assert.match(
      code('src/features/conversation/hooks/use-conversation.ts'),
      /name: 'conversation_turn'/,
    );
  });

  it('splits everything by plan', () => {
    assert.match(
      code('src/store/entitlements-store.tsx'),
      /services\.analytics\.setUserProperty\(\{ name: 'plan', value: current\.plan \}\)/,
    );
  });

  it('follows a learner through Fabalita, part by part', () => {
    const lesson = code('src/features/academy/screens/lesson-screen.tsx');
    assert.match(lesson, /name: 'lesson_start'/);
    assert.match(lesson, /name: 'lesson_section_complete'/);
    const coach = code('src/features/academy/hooks/use-lesson-tools.ts');
    assert.match(coach, /name: 'roleplay_turn'/);
    assert.match(coach, /name: 'roleplay_failed'/);
    assert.match(
      code('src/features/academy/screens/final-exam-screen.tsx'),
      /name: 'final_part_done'/,
    );
    assert.match(
      code('src/features/academy/screens/academy-onboarding.tsx'),
      /name: 'placement_done'/,
    );
    assert.match(
      code('src/features/academy/screens/practice-screen.tsx'),
      /name: 'academy_practice_open'/,
    );
    assert.match(
      code('src/features/academy/components/reminder-offer.tsx'),
      /name: 'reminder_enabled'/,
    );
  });

  it('counts server outages wherever the maintenance message can show', () => {
    for (const path of [
      'src/features/translation/hooks/use-translation.ts',
      'src/features/conversation/hooks/use-conversation.ts',
      'src/features/academy/hooks/use-lesson-tools.ts',
      'src/features/academy/screens/final-exam-screen.tsx',
    ]) {
      assert.match(code(path), /logIfServerDown\(services\.analytics, '/, path);
    }
    const logged: string[] = [];
    const analytics = {
      ...noopAnalyticsService,
      log: (event: { name: string }) => logged.push(event.name),
    };
    logIfServerDown(analytics, 'translate', { code: 'server_down', message: '' });
    logIfServerDown(analytics, 'translate', { code: 'invalid_response', message: '' });
    logIfServerDown(analytics, 'translate', { code: 'network_unavailable', message: '' });
    assert.deepEqual(logged, ['server_down', 'server_down']);
  });

  it('tells who uninstalled: course, progress and app language', () => {
    const academy = code('src/store/academy-store.tsx');
    assert.match(academy, /name: 'academy_course'/);
    assert.match(academy, /name: 'academy_day'/);
    assert.match(code('src/store/preferences-store.tsx'), /name: 'app_language'/);
    assert.deepEqual(
      [
        academyDayBand(0, false),
        academyDayBand(1, false),
        academyDayBand(5, false),
        academyDayBand(6, false),
        academyDayBand(20, false),
        academyDayBand(59, false),
        academyDayBand(60, true),
      ],
      ['0', '1', '2-5', '6-20', '6-20', '21-60', 'done'],
    );
  });

  it('never sends text the user typed, spoke or saved', () => {
    // The closed list of events has no field that could carry it.
    const events = code(EVENTS);
    for (const field of ['text:', 'translation:', 'heard:', 'transcript']) {
      assert.equal(events.includes(field), false, field);
    }
  });

  it('loads Firebase only where it exists, so Expo Go does not crash', () => {
    const service = code('src/services/analytics/firebase-analytics-service.ts');
    assert.match(service, /TurboModuleRegistry\?\.get\?\.\('NativeRNFBTurboAnalytics'\)/);
    assert.match(service, /return noopAnalyticsService/);
  });

  it('keeps the Firebase config file out of git', () => {
    assert.match(read('.gitignore'), /^google-services\.json$/m);
  });
});

describe('only the pressed speaker button changes', () => {
  it('tracks which text is being read, not just whether something is', () => {
    const hook = code('src/features/translation/hooks/use-speak.ts');

    assert.match(hook, /const isSpeaking = useCallback\(\(text: string\) => current === text/);
    // An interrupted text must not switch the new one's button back.
    assert.match(hook, /setCurrent\(\(now\) => \(now === text \? undefined : now\)\)/);
  });

  it('asks per phrase, per turn and per translation, never the shared flag', () => {
    for (const path of [
      'src/features/phrases/screens/phrases-screen.tsx',
      'src/features/conversation/screens/conversation-screen.tsx',
      'src/features/translation/components/translation-result-card.tsx',
      'src/features/history/screens/history-detail-screen.tsx',
    ]) {
      const source = code(path);
      assert.equal(/speaking=\{speak\.speaking\}/.test(source), false, path);
      assert.equal(/speak\.speaking \?/.test(source), false, path);
    }
  });
});

describe('the Phrases shortcut says it is new, until it has been seen', () => {
  it('carries a solid New tag while Phrases is unseen', () => {
    const screen = code('src/features/translation/screens/translate-screen.tsx');
    assert.match(screen, /badge: preferences\.phrasesSeen \? undefined : msg\('New'\)/);
    const tiles = code('src/features/translation/components/feature-tiles.tsx');
    assert.match(tiles, /tone="highlight"/);
    // Marked where it is set, translated where it is shown.
    assert.match(tiles, /<Badge label=\{t\(tile\.badge\)\}/);
  });

  it('drops the tag for good once the screen is opened', () => {
    assert.match(
      code('src/features/phrases/screens/phrases-screen.tsx'),
      /if \(!preferences\.phrasesSeen\) update\(\{ phrasesSeen: true \}\)/,
    );
  });
});

describe('full-screen views clear the navigation bar on every phone', () => {
  it('measure their own window, not the app’s', () => {
    for (const path of [
      'src/features/phrases/components/phrase-show-modal.tsx',
      'src/features/camera/components/text-scanner.tsx',
    ]) {
      const source = code(path);
      // The provider sits inside the modal, so the insets are the modal's own.
      assert.match(
        source,
        /<Modal[\s\S]*<SafeAreaProvider>[\s\S]*<\/SafeAreaProvider>\s*<\/Modal>/,
        path,
      );
      assert.match(source, /paddingBottom: insets\.bottom \+ theme\.spacing\.lg/, path);
    }
  });
});
