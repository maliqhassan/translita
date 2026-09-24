import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { FEATURES } from '@/constants';

/**
 * The two-sided conversation screen.
 *
 * Structural, like every other screen test here: React Native will not render
 * under Node. What these pin is the part that is decidable from source — that
 * it composes the existing capabilities rather than reimplementing any of
 * them, that one microphone is shared, and that a turn's direction follows
 * the button that was pressed.
 */

const read = (path: string) => readFileSync(path, 'utf8');

const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const SCREEN = 'src/features/conversation/screens/conversation-screen.tsx';
const HOOK = 'src/features/conversation/hooks/use-conversation.ts';
const TURN = 'src/features/conversation/components/conversation-turn.tsx';
const TRANSLATE = 'src/features/translation/screens/translate-screen.tsx';

describe('the conversation screen exists and is reachable', () => {
  it('is shipped behind the flag that used to be only a name', () => {
    assert.equal(FEATURES.conversationMode, true);
  });

  it('has a route, as a one-line re-export', () => {
    assert.ok(existsSync('app/conversation.tsx'));
    assert.equal(
      read('app/conversation.tsx').trim(),
      "export { ConversationScreen as default } from '@/features/conversation';",
    );
    assert.match(read('app/_layout.tsx'), /name="conversation"/);
  });

  it('is what the voice shortcut opens', () => {
    const screen = code(TRANSLATE);

    assert.match(screen, /router\.push\('\/conversation'\)/);
    // The shortcut no longer duplicates the composer's own microphone.
    assert.equal(screen.includes('speech.toggle(pair.source)'), false);
  });
});

describe('it composes what already exists', () => {
  it('translates through the same path the main screen uses', () => {
    // Not a second translation implementation: the same helper, so a spoken
    // turn reaches history exactly as a typed one does.
    assert.match(code(HOOK), /translateAndRecord\(/);
    assert.match(code(HOOK), /services\.translation\.router/);
    assert.match(code(HOOK), /origin: 'voice'/);
  });

  it('respects the save-history preference rather than forcing it', () => {
    assert.match(code(HOOK), /saveHistory: preferences\.saveHistory/);
  });

  it('reuses the existing recogniser and speech engine', () => {
    const screen = code(SCREEN);

    assert.match(screen, /useSpeechRecognition\(/);
    assert.match(screen, /useSpeak\(/);
    // No second recogniser: the platform gives one microphone session.
    assert.equal((screen.match(/useSpeechRecognition\(/g) ?? []).length, 1);
  });

  it('holds no SQL, no engine choice and no native import', () => {
    const hook = code(HOOK);

    for (const forbidden of ['expo-sqlite', 'expo-speech', 'SELECT', 'INSERT']) {
      assert.equal(hook.includes(forbidden), false, forbidden);
    }
  });
});

describe('a turn goes in the direction of the button that was pressed', () => {
  it('sends the near side source to target, and the far side the other way', () => {
    const hook = code(HOOK);

    assert.match(
      hook,
      /return side === 'near' \? \{ from: source, to: target \} : \{ from: target, to: source \}/,
    );
  });

  it('shows the turn before its translation arrives', () => {
    // Waiting for the round trip would make the phone look like it had not
    // heard, which is the one thing a conversation cannot afford.
    const hook = code(HOOK);

    // The turn is appended with what was heard and no result, then patched
    // once the translation lands.
    assert.ok(
      hook.includes('{ id, side, heard: text, sourceLanguage: from, targetLanguage: to }'),
      'the turn is not appended before translating',
    );
    assert.ok(hook.includes('{ ...turn, result: result.value }'), 'the turn is never patched');

    // And the card says so rather than showing an empty bubble.
    assert.ok(code(TURN).includes('Translating…'));
  });

  it('keeps what was heard even when translating fails', () => {
    assert.match(code(HOOK), /\{ \.\.\.turn, error: result\.error \}/);
  });

  it('ignores an empty transcript rather than adding a blank turn', () => {
    assert.match(code(HOOK), /if \(!text\) return;/);
  });
});

describe('the two microphones cannot fight over one session', () => {
  it('refuses the second side while the first is still open', () => {
    assert.match(
      code(SCREEN),
      /if \(conversation\.listening && conversation\.listening !== side\) return;/,
    );
  });

  it('remembers which side opened it in a ref, not in state', () => {
    // The recogniser's callbacks fire outside React's update cycle and must
    // see the side that is true now, not the one from the last render.
    const screen = code(SCREEN);

    assert.match(screen, /const openedBy = useRef<Side \| undefined>\(undefined\)/);
    assert.match(screen, /const side = openedBy\.current;/);
  });

  it('hides nothing but says why when the device cannot listen', () => {
    const screen = code(SCREEN);

    assert.match(screen, /speech\.status !== 'unavailable'/);
    assert.match(screen, /no speech recogniser/i);
  });
});

describe('the transcript reads as a conversation', () => {
  it('sides each turn, and does not rely on colour alone', () => {
    const turn = code(TURN);

    assert.match(turn, /justifyContent: isNear \? 'flex-end' : 'flex-start'/);
  });

  it('offers share, copy and listen on a finished turn', () => {
    const turn = code(TURN);

    assert.match(turn, /accessibilityLabel="Share this translation"/);
    assert.match(turn, /accessibilityLabel="Copy this translation"/);
    assert.match(turn, /Read this aloud/);
  });

  it('styles itself through the theme, with no literal colours', () => {
    for (const path of [SCREEN, TURN]) {
      const source = code(path);

      assert.match(source, /useTheme\(\)/);
      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(source), false, `literal colour in ${path}`);
    }
  });

  it('gates nothing on a plan', () => {
    for (const path of [SCREEN, TURN, HOOK]) {
      const source = code(path);

      assert.equal(source.includes('useEntitlements'), false, path);
      assert.equal(/plan === /.test(source), false, path);
      assert.equal(source.includes("has('"), false, path);
    }
  });
});
