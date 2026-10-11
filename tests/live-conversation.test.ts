import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { DEFAULT_PREFERENCES } from '@/services/preferences/preferences-schema';

/**
 * Live interpreting: the Conversation screen reads each answer aloud as it
 * arrives, so two people can simply take turns talking.
 */

const read = (path: string) => readFileSync(path, 'utf8');

/** Source with block comments and comment-only lines removed. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const HOOK = 'src/features/conversation/hooks/use-conversation.ts';
const SCREEN = 'src/features/conversation/screens/conversation-screen.tsx';
const SPEAK = 'src/features/translation/hooks/use-speak.ts';

describe('what gets read aloud', () => {
  it('reads a translation in the listener’s language', () => {
    // `to` is the side that did not speak.
    assert.match(
      code(HOOK),
      /result\.ok \? \{ text: result\.value\.translatedText, language: to \} : undefined/,
    );
  });

  it('reads the tutor’s reply and question back, in the language being learned', () => {
    const hook = code(HOOK);

    assert.match(hook, /result\.value\.kind === 'reply'/);
    assert.match(hook, /\$\{result\.value\.reply\} \$\{result\.value\.followUp\}/);
  });

  it('reads nothing for a failure, a clarification or a refusal', () => {
    // Both answers fall back to undefined, which the screen skips.
    assert.equal((code(HOOK).match(/: undefined;/g) ?? []).length >= 2, true);
  });
});

describe('the interpreter on screen', () => {
  it('is on by default, and remembered', () => {
    assert.equal(DEFAULT_PREFERENCES.conversationAutoSpeak, true);
  });

  it('speaks each answer as it arrives, when on and when the phone can speak', () => {
    const screen = code(SCREEN);

    assert.match(
      screen,
      /const autoSpeak = preferences\.conversationAutoSpeak && speak\.available;/,
    );
    assert.match(screen, /if \(autoSpeak && answer\) \{/);
  });

  it('stops the voice when the next person starts speaking', () => {
    // Otherwise the microphone hears the phone and translates it back.
    assert.match(code(SCREEN), /speak\.stop\(\);\s*openedBy\.current = side;/);
  });

  it('has a speaker button that switches it, and stops speech when turned off', () => {
    const screen = code(SCREEN);

    assert.match(
      screen,
      /update\(\{ conversationAutoSpeak: !preferences\.conversationAutoSpeak \}\)/,
    );
    assert.match(screen, /if \(preferences\.conversationAutoSpeak\) speak\.stop\(\);/);
  });

  it('interrupts whatever is playing rather than queueing behind it', () => {
    assert.match(
      code(SPEAK),
      /const say = useCallback\(\s*async[\s\S]{0,120}await services\.tts\.stop\(\);/,
    );
  });
});
