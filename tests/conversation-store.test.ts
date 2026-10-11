import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import {
  appendTurn,
  clearTurns,
  mergeTurns,
  nextAdCount,
  updateTurn,
  type ConversationTurn,
  type TurnsByMode,
} from '@/store/conversation-store';

/**
 * The state behind the Conversation screen's transcripts and its ad cadence.
 *
 * Tested as reducers, not as a rendered provider — the same reason
 * `directionFor` and `translationCacheKey` are plain functions elsewhere.
 * What matters is provable without React: a turn lands in the right mode's
 * list and no other, an update patches by id alone, and the ad interval fires
 * on exactly the reply that reaches it.
 */

const EMPTY: TurnsByMode = { person: [], tutor: [] };

function turn(id: string): ConversationTurn {
  return { id, side: 'near', heard: id, sourceLanguage: 'en', targetLanguage: 'de' };
}

describe('appendTurn', () => {
  it('adds to the named mode, leaving the other untouched', () => {
    const next = appendTurn(EMPTY, 'person', turn('a'));

    assert.deepEqual(next.person, [turn('a')]);
    assert.deepEqual(next.tutor, []);
  });

  it('appends after what is already there, in order', () => {
    const once = appendTurn(EMPTY, 'tutor', turn('a'));
    const twice = appendTurn(once, 'tutor', turn('b'));

    assert.deepEqual(
      twice.tutor.map((t) => t.id),
      ['a', 'b'],
    );
  });

  it('does not mutate the state it was given', () => {
    const before = appendTurn(EMPTY, 'person', turn('a'));
    appendTurn(before, 'person', turn('b'));

    assert.equal(before.person.length, 1, 'the earlier snapshot changed');
  });
});

describe('updateTurn', () => {
  it('patches only the turn with the matching id', () => {
    const state: TurnsByMode = { person: [turn('a'), turn('b')], tutor: [] };

    const next = updateTurn(state, 'person', 'a', (t) => ({ ...t, heard: 'changed' }));

    assert.equal(next.person.find((t) => t.id === 'a')?.heard, 'changed');
    assert.equal(next.person.find((t) => t.id === 'b')?.heard, 'b');
  });

  it('leaves the other mode entirely alone', () => {
    const state: TurnsByMode = { person: [turn('a')], tutor: [turn('a')] };

    const next = updateTurn(state, 'person', 'a', (t) => ({ ...t, heard: 'changed' }));

    assert.equal(next.tutor[0]?.heard, 'a', 'the same id in the other mode was also patched');
  });

  it('is a no-op when nothing matches the id', () => {
    const state: TurnsByMode = { person: [turn('a')], tutor: [] };

    const next = updateTurn(state, 'person', 'missing', (t) => ({ ...t, heard: 'changed' }));

    assert.deepEqual(next, state);
  });
});

describe('clearTurns', () => {
  it('empties only the named mode', () => {
    const state: TurnsByMode = { person: [turn('a')], tutor: [turn('b')] };

    const next = clearTurns(state, 'person');

    assert.deepEqual(next.person, []);
    assert.deepEqual(next.tutor, [turn('b')]);
  });
});

describe('nextAdCount', () => {
  it('is never due before the interval is reached', () => {
    let count = 0;
    for (let i = 0; i < 2; i += 1) {
      const step = nextAdCount(count, 3);
      assert.equal(step.due, false, `reply ${i + 1} of 3 fired early`);
      count = step.count;
    }
  });

  it('is due on exactly the reply that reaches the interval', () => {
    const step = nextAdCount(2, 3);

    assert.equal(step.due, true);
    assert.equal(step.count, 0, 'the count must reset on the firing reply, not the one after');
  });

  it('repeats every interval, not once', () => {
    let count = 0;
    const fired: number[] = [];
    for (let reply = 1; reply <= 9; reply += 1) {
      const step = nextAdCount(count, 3);
      count = step.count;
      if (step.due) fired.push(reply);
    }

    assert.deepEqual(fired, [3, 6, 9]);
  });

  it('counts one reply on either mode toward the same interval', () => {
    // The function itself takes no mode — that is the point. Person and
    // Practice both call it against the one counter the store keeps.
    const first = nextAdCount(0, 3);
    const second = nextAdCount(first.count, 3);
    const third = nextAdCount(second.count, 3);

    assert.deepEqual(
      [first.due, second.due, third.due],
      [false, false, true],
      'three replies from any mix of modes must still fire on the third',
    );
  });
});

describe('the store is reachable where a persisted conversation needs it', () => {
  it('is mounted once, above the screens, so it survives navigating away and back', () => {
    const providers = readFileSync('src/store/app-providers.tsx', 'utf8');

    assert.match(providers, /<ConversationProvider>/);
  });

  it('the interval is a named constant, not a literal repeated at each call site', () => {
    const store = readFileSync('src/store/conversation-store.tsx', 'utf8');

    assert.match(store, /CONVERSATION_AD_INTERVAL/);
  });
});

describe('a transcript survives closing the app, not only navigating away', () => {
  it('hydrates from the conversation history service on mount', () => {
    const store = readFileSync('src/store/conversation-store.tsx', 'utf8');

    assert.match(store, /services\.conversationHistory\.load\(\)/);
  });

  it('mirrors every change back to it', () => {
    const store = readFileSync('src/store/conversation-store.tsx', 'utf8');

    assert.match(store, /services\.conversationHistory\.save\(turns\)/);
  });

  it('never writes the empty starting state over a transcript still loading', () => {
    // Without this guard, the save effect that reacts to every `turns` change
    // would fire once on mount — before `load()` resolves — and persist the
    // empty state right over whatever was on disk from the last session.
    const store = readFileSync('src/store/conversation-store.tsx', 'utf8');

    assert.match(store, /if \(!hydrated\.current\) return;/);
  });
});

describe('Person and Practice both keep their history', () => {
  it('does not wipe a transcript when switching between the two', () => {
    const screen = readFileSync(
      'src/features/conversation/screens/conversation-screen.tsx',
      'utf8',
    );
    const start = screen.indexOf("{ value: 'tutor', label: t('Practice') }");
    const handler = screen.slice(start, screen.indexOf('setMode(next);', start));

    assert.ok(start >= 0 && handler.length > 0, 'the mode switch was not found');
    assert.equal(handler.includes('conversation.clear()'), false, 'switching clears a transcript');
  });

  it('keeps a turn spoken before the saved history finished loading', () => {
    const stored: TurnsByMode = { person: [turn('a')], tutor: [turn('b')] };
    const added: TurnsByMode = { person: [turn('c')], tutor: [] };

    const merged = mergeTurns(stored, added);
    assert.deepEqual(
      merged.person.map((item) => item.id),
      ['a', 'c'],
    );
    assert.deepEqual(
      merged.tutor.map((item) => item.id),
      ['b'],
    );
    assert.match(
      readFileSync('src/store/conversation-store.tsx', 'utf8'),
      /setTurns\(\(current\) => mergeTurns\(stored, current\)\)/,
    );
  });
});
