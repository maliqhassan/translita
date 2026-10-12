import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { parseRoleplayRequest, readUserId } from '../src/academy/academy-handler';
import {
  createDailyAllowance,
  createRevenueCatChecker,
  type EntitlementChecker,
} from '../src/academy/access';
import type { AcademyProvider, RoleplayRequest } from '../src/academy/contract';
import { createOpenAiAcademy, toRoleplayReply } from '../src/academy/openai-provider';
import { loadConfig } from '../src/config';
import { createRateLimiter } from '../src/rate-limit';
import { createRequestHandler } from '../src/server';
import { createFakeProvider } from '../src/translation/fake-provider';
import { createLanguageResolver, loadLanguageMap } from '../src/translation/language-map';

/**
 * The Academy's AI partner endpoint.
 *
 * As with the tutor: input is refused before anything is spent, the
 * credentials never come back out, and the allowance is the server's to give.
 */

const languages = createLanguageResolver(loadLanguageMap());
const config = loadConfig({ TRANSLATION_PROVIDER: 'fake' });
const SECRET = 'sk-proj-THIS-MUST-NEVER-APPEAR-IN-A-RESPONSE';

const scene = {
  partnerRole: 'a waiter at a café',
  learnerRole: 'a customer',
  brief: 'Take the order, one question at a time.',
  goal: 'Order a coffee.',
};
const valid = { learning: 'de', scene, words: ['Kaffee', 'bitte'], heard: 'Ein Kaffee, bitte.' };

let server: Server;
let baseUrl = '';
let seen: RoleplayRequest | undefined;
let calls = 0;

const fakePartner: AcademyProvider = {
  id: 'fake',
  async roleplay(request) {
    seen = request;
    calls++;
    if (request.heard === 'boom') throw new Error(`upstream said no, key was ${SECRET}`);
    if (request.heard === 'off topic')
      return { kind: 'declined', message: 'Let us stay in the café.' };
    return {
      kind: 'reply',
      correction: request.heard === 'Ein Kaffee bitte' ? null : null,
      reply: 'Gern! Groß oder klein?',
      replyMeaning: 'Sure! Large or small?',
      done: false,
    };
  },
};

/** Elite for one user id, free for everyone else. */
const entitlements: EntitlementChecker = {
  configured: true,
  async hasAcademy(userId) {
    return userId === 'elite-user';
  },
};

before(async () => {
  const handler = createRequestHandler({
    config,
    provider: createFakeProvider(),
    languages,
    rateLimiter: createRateLimiter({ max: 1000, windowMs: 60_000 }),
    academy: fakePartner,
    academyRateLimiter: createRateLimiter({ max: 1000, windowMs: 60_000 }),
    entitlements,
    allowance: createDailyAllowance({ free: 3, academy: 6 }),
  });
  server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (body: unknown, userId?: string) =>
  fetch(`${baseUrl}/academy/roleplay`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-app-user-id': userId } : {}),
    },
    body: JSON.stringify(body),
  });

describe('POST /academy/roleplay', () => {
  it('answers in the scene, with the line in English beside it', async () => {
    const response = await post(valid, 'user-a');
    assert.equal(response.status, 200);
    const body = (await response.json()) as { kind: string; reply: string; replyMeaning: string };
    assert.equal(body.kind, 'reply');
    assert.ok(body.reply.length > 0);
    assert.ok(body.replyMeaning.length > 0);
    assert.equal(seen?.learning, 'de');
    assert.deepEqual(seen?.words, ['Kaffee', 'bitte']);
  });

  it('lets the partner open the scene with nothing said yet', async () => {
    const response = await post({ ...valid, heard: '' }, 'user-open');
    assert.equal(response.status, 200);
    assert.equal(seen?.heard, '');
  });

  it('refuses malformed input before anything is spent', async () => {
    const before = calls;
    for (const body of [
      {},
      { ...valid, learning: 'not a language!' },
      { ...valid, learning: 'en' },
      { ...valid, scene: { ...scene, goal: '' } },
      { ...valid, heard: 'x'.repeat(301) },
      { ...valid, heard: '', history: [{ role: 'learner', text: 'hallo' }] },
    ]) {
      const response = await post(body, 'user-bad');
      assert.equal(response.status, 400, JSON.stringify(body).slice(0, 60));
    }
    assert.equal(calls, before, 'a rejected request reached the provider');
  });

  it('gives a free allowance, then stops for the day', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 4; i++) statuses.push((await post(valid, 'free-user')).status);
    assert.deepEqual(statuses, [200, 200, 200, 429]);
  });

  it('gives the Academy a larger allowance', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) statuses.push((await post(valid, 'elite-user')).status);
    assert.deepEqual(statuses, [200, 200, 200, 200, 200, 200, 429]);
  });

  it('declines anything that is not the practice', async () => {
    const body = (await (await post({ ...valid, heard: 'off topic' }, 'user-b')).json()) as {
      kind: string;
    };
    assert.equal(body.kind, 'declined');
  });

  it('never returns a provider error, or anything in it', async () => {
    const response = await post({ ...valid, heard: 'boom' }, 'user-c');
    assert.equal(response.status, 503);
    assert.equal((await response.text()).includes(SECRET), false);
  });
});

describe('reading a role-play request', () => {
  it('keeps the thread short and the words few', () => {
    const request = parseRoleplayRequest({
      ...valid,
      words: Array.from({ length: 30 }, (_, i) => `Wort${i}`),
      history: Array.from({ length: 30 }, (_, i) => ({
        role: i % 2 ? 'partner' : 'learner',
        text: `line ${i}`,
      })),
    });
    assert.equal(request?.words.length, 12);
    assert.equal(request?.history.length, 12);
    assert.equal(request?.addressAs, 'unspecified');
  });

  it('accepts RevenueCat user ids and nothing odd', () => {
    assert.equal(readUserId('$RCAnonymousID:abc123'), '$RCAnonymousID:abc123');
    assert.equal(readUserId('a b'), undefined);
    assert.equal(readUserId(undefined), undefined);
  });
});

describe('the OpenAI role-play partner', () => {
  it('sends the scene and the credential only to OpenAI, and parses the reply', async () => {
    let url = '';
    let auth = '';
    let prompt = '';
    const academy = createOpenAiAcademy({
      apiKey: SECRET,
      fetchImpl: (async (input: string, init: RequestInit) => {
        url = input;
        auth = (init.headers as Record<string, string>).Authorization ?? '';
        prompt = String(init.body);
        return new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    kind: 'reply',
                    correction: { said: 'Ein Kaffee', better: 'Einen Kaffee', why: 'Accusative.' },
                    reply: 'Gern!',
                    replyMeaning: 'Sure!',
                    done: true,
                  }),
                },
              },
            ],
          }),
        );
      }) as typeof fetch,
    });
    const reply = await academy.roleplay({
      learning: 'de',
      scene,
      words: ['Kaffee'],
      heard: 'Ein Kaffee',
      history: [],
      addressAs: 'female',
    });
    assert.equal(url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(auth, `Bearer ${SECRET}`);
    assert.ok(prompt.includes('German'));
    assert.ok(prompt.includes('a waiter at a café'));
    assert.ok(prompt.includes('as a woman'));
    assert.deepEqual(reply, {
      kind: 'reply',
      correction: { said: 'Ein Kaffee', better: 'Einen Kaffee', why: 'Accusative.' },
      reply: 'Gern!',
      replyMeaning: 'Sure!',
      done: true,
    });
  });

  it('drops a correction that corrects nothing, and rejects an empty reply', () => {
    const reply = toRoleplayReply({
      kind: 'reply',
      correction: { said: 'Hallo', better: 'hallo', why: '' },
      reply: 'Hallo!',
      replyMeaning: 'Hello!',
    });
    assert.equal(reply.kind === 'reply' && reply.correction, null);
    assert.throws(() => toRoleplayReply({ kind: 'reply', reply: '' }));
  });
});

describe('who has the Academy', () => {
  it('asks RevenueCat with the secret key, and remembers the answer', async () => {
    let asked = 0;
    let auth = '';
    const checker = createRevenueCatChecker({
      secretKey: 'sk_secret',
      entitlement: 'elite',
      now: () => Date.parse('2026-10-12T00:00:00Z'),
      fetchImpl: (async (_input: string, init: RequestInit) => {
        asked++;
        auth = (init.headers as Record<string, string>).Authorization ?? '';
        return new Response(
          JSON.stringify({
            subscriber: { entitlements: { elite: { expires_date: '2026-11-12T00:00:00Z' } } },
          }),
        );
      }) as typeof fetch,
    });
    assert.equal(await checker.hasAcademy('user-1'), true);
    assert.equal(await checker.hasAcademy('user-1'), true);
    assert.equal(asked, 1);
    assert.equal(auth, 'Bearer sk_secret');
  });

  it('treats an expired or missing entitlement, or no key, as free', async () => {
    const expired = createRevenueCatChecker({
      secretKey: 'sk_secret',
      entitlement: 'elite',
      now: () => Date.parse('2026-12-01T00:00:00Z'),
      fetchImpl: (async () =>
        new Response(
          JSON.stringify({
            subscriber: { entitlements: { elite: { expires_date: '2026-11-12T00:00:00Z' } } },
          }),
        )) as unknown as typeof fetch,
    });
    assert.equal(await expired.hasAcademy('user-2'), false);

    const noKey = createRevenueCatChecker({ entitlement: 'elite' });
    assert.equal(noKey.configured, false);
    assert.equal(await noKey.hasAcademy('user-3'), false);
  });

  it('starts every allowance again on a new day', () => {
    let now = Date.parse('2026-10-12T23:00:00Z');
    const allowance = createDailyAllowance({ free: 1, academy: 2, now: () => now });
    assert.equal(allowance.take('a', false), true);
    assert.equal(allowance.take('a', false), false);
    now = Date.parse('2026-10-13T01:00:00Z');
    assert.equal(allowance.take('a', false), true);
  });
});
