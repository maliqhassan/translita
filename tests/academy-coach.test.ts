import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { createBackendCoachService, toCoachReply, type CoachAsk } from '@/services/coach';
import type { HttpClient, HttpRequest } from '@/services/http';
import { ok } from '@/utils';

const ask: CoachAsk = {
  learning: 'de',
  scene: {
    partnerRole: 'a waiter',
    learnerRole: 'a customer',
    brief: 'Take the order.',
    goal: 'Order a coffee.',
  },
  words: ['Kaffee', 'bitte'],
  heard: 'Ein Kaffee, bitte.',
  history: [{ role: 'partner', text: 'Was darf es sein?' }],
  addressAs: 'unspecified',
};

/** An HTTP client that records the request and answers with what it is given. */
function fakeHttp(status: number, data: unknown) {
  const sent: HttpRequest[] = [];
  const http: HttpClient = {
    async send(request) {
      sent.push(request);
      return ok({ status, ok: status >= 200 && status < 300, data });
    },
  };
  return { http, sent };
}

describe('the Academy coach service', () => {
  it('posts the scene to the server, with RevenueCat’s user id', async () => {
    const { http, sent } = fakeHttp(200, {
      kind: 'reply',
      correction: { said: 'Ein Kaffee', better: 'Einen Kaffee', why: 'Accusative.' },
      reply: 'Gern!',
      replyMeaning: 'Sure!',
      done: false,
    });
    const coach = createBackendCoachService({
      baseUrl: 'https://api.example/',
      path: '/academy/roleplay',
      http,
      userId: async () => '$RCAnonymousID:abc',
    });
    const result = await coach.roleplay(ask);
    assert.equal(result.ok, true);
    assert.equal(sent[0]?.url, 'https://api.example/academy/roleplay');
    assert.deepEqual(sent[0]?.headers, { 'x-app-user-id': '$RCAnonymousID:abc' });
    assert.equal((sent[0]?.body as { learning: string }).learning, 'de');
    if (result.ok && result.value.kind === 'reply') {
      assert.equal(result.value.correction?.better, 'Einen Kaffee');
    }
  });

  it('still works without a user id, and explains the daily limit', async () => {
    const { http, sent } = fakeHttp(429, { error: { code: 'rate_limited' } });
    const coach = createBackendCoachService({
      baseUrl: 'https://api.example',
      path: '/academy/roleplay',
      http,
      userId: async () => undefined,
    });
    const result = await coach.roleplay(ask);
    assert.equal(sent[0]?.headers, undefined);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, 'rate_limited');
  });

  it('is unavailable without a backend, and calls nothing', async () => {
    const { http, sent } = fakeHttp(200, {});
    const coach = createBackendCoachService({
      path: '/academy/roleplay',
      http,
      userId: async () => undefined,
    });
    assert.equal(await coach.isAvailable(), false);
    assert.equal((await coach.roleplay(ask)).ok, false);
    assert.equal(sent.length, 0);
  });

  it('accepts only the shapes the server sends', () => {
    assert.deepEqual(toCoachReply({ kind: 'declined', message: 'Stay in the scene.' }), {
      kind: 'declined',
      message: 'Stay in the scene.',
    });
    assert.equal(toCoachReply({ kind: 'reply', reply: '' }), undefined);
    assert.equal(toCoachReply({ kind: 'other' }), undefined);
    assert.equal(
      (
        toCoachReply({ kind: 'reply', reply: 'Hallo', correction: { said: '', better: '' } }) as {
          correction: unknown;
        }
      ).correction,
      null,
    );
  });

  it('keeps the model key out of the app', () => {
    const service = readFileSync('src/services/coach/coach-service.ts', 'utf8');
    assert.equal(/OPENAI|sk-|Authorization/.test(service), false);
  });
});

describe('the role-play in a lesson', () => {
  it('only offers the AI partner with a backend and a connection', () => {
    const player = readFileSync('src/features/academy/screens/lesson-screen.tsx', 'utf8');
    assert.ok(player.includes('useCoachConnection(enrollment.addressAs)'));
    assert.ok(
      readFileSync('src/features/academy/hooks/use-lesson-tools.ts', 'utf8').includes(
        'available: configured && !offline',
      ),
    );
  });

  it('ends the scene after a few lines whatever happens, and lets the learner leave', () => {
    const step = readFileSync('src/features/academy/lesson/roleplay-step.tsx', 'utf8');
    assert.ok(step.includes('const MAX_LEARNER_LINES = 6;'));
    assert.ok(step.includes("t('End the conversation')"));
    assert.ok(step.includes('if (!coach.available) {'));
  });
});
