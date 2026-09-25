import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { loadConfig } from '../src/config';
import { createRateLimiter } from '../src/rate-limit';
import { createRequestHandler } from '../src/server';
import { createFakeProvider } from '../src/translation/fake-provider';
import { createLanguageResolver, loadLanguageMap } from '../src/translation/language-map';
import type { TutorProvider, TutorReply, TutorRequest } from '../src/tutor/contract';
import { createOpenAiTutor } from '../src/tutor/openai-provider';
import { parseTutorRequest } from '../src/tutor/tutor-handler';

/**
 * The language-practice endpoint.
 *
 * The credential is the whole reason this lives on the server, so most of what
 * is pinned here is about the credential never coming back out — and about
 * refusing malformed input *before* anything is spent, because unlike the
 * translation provider this one bills per request.
 */

const languages = createLanguageResolver(loadLanguageMap());
const config = loadConfig({ TRANSLATION_PROVIDER: 'fake' });

const SECRET = 'sk-proj-THIS-MUST-NEVER-APPEAR-IN-A-RESPONSE';

let server: Server;
let baseUrl = '';
let seen: TutorRequest | undefined;

/** A tutor that records what it was asked and answers predictably. */
const fakeTutor: TutorProvider = {
  id: 'fake',
  async respond(request) {
    seen = request;
    if (request.heard === 'boom') throw new Error(`upstream said no, key was ${SECRET}`);
    if (request.heard === 'garbled') {
      return { kind: 'clarify', options: ['¿Cómo estás?', '¿Cómo está?'] };
    }
    if (request.heard === 'off topic') {
      return { kind: 'declined', message: 'Let us stick to practising.' };
    }
    return {
      kind: 'reply',
      heardGloss: 'How are you',
      reply: 'Muy bien',
      gloss: 'Very well',
      followUp: '¿Y tú?',
      followUpGloss: 'And you?',
    };
  },
};

before(async () => {
  const handler = createRequestHandler({
    config,
    provider: createFakeProvider(),
    languages,
    rateLimiter: createRateLimiter({ max: 1000, windowMs: 60_000 }),
    tutor: fakeTutor,
    tutorRateLimiter: createRateLimiter({ max: 1000, windowMs: 60_000 }),
  });

  server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const post = (body: unknown, path = '/tutor') =>
  fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const ask = (heard: string) => post({ learning: 'es', native: 'en', heard });

describe('POST /tutor', () => {
  it('answers in the language being practised, and asks something back', async () => {
    const response = await ask('how are you');
    assert.equal(response.status, 200);

    const body = (await response.json()) as TutorReply & { kind: 'reply' };
    assert.equal(body.kind, 'reply');
    assert.equal(body.reply, 'Muy bien');
    assert.equal(body.gloss, 'Very well');
    assert.ok(body.followUp.length > 0, 'a tutor that asks nothing back ends the conversation');
    // Both halves of the exchange are bilingual, not just the tutor's own reply.
    assert.ok(body.heardGloss.length > 0, 'what the learner said was never translated back');
    assert.ok(body.followUpGloss.length > 0, 'the question back was never translated');
  });

  it('offers choices rather than guessing at something garbled', async () => {
    const body = (await (await ask('garbled')).json()) as TutorReply & { kind: 'clarify' };

    assert.equal(body.kind, 'clarify');
    assert.ok(body.options.length >= 2, 'one option is not a choice');
  });

  it('declines anything that is not language practice', async () => {
    const body = (await (await ask('off topic')).json()) as TutorReply & { kind: 'declined' };

    assert.equal(body.kind, 'declined');
    assert.ok(body.message.length > 0);
  });

  it('passes the thread through so the tutor can stay coherent', async () => {
    await post({
      learning: 'fr',
      native: 'en',
      heard: 'bonjour',
      history: [
        { role: 'learner', text: 'salut' },
        { role: 'tutor', text: 'salut !' },
      ],
    });

    assert.equal(seen?.learning, 'fr');
    assert.equal(seen?.history.length, 2);
    assert.equal(seen?.history[0]?.role, 'learner');
  });
});

describe('it refuses before it spends', () => {
  /** Every case below must be rejected without the provider being called. */
  const rejected: [string, unknown][] = [
    ['no body at all', {}],
    ['no heard', { learning: 'es', native: 'en' }],
    ['empty heard', { learning: 'es', native: 'en', heard: '   ' }],
    ['no learning', { native: 'en', heard: 'hola' }],
    ['same language both sides', { learning: 'en', native: 'en', heard: 'hello' }],
    ['a language that is not a code', { learning: 'españolísimo!', native: 'en', heard: 'hola' }],
    ['heard far too long', { learning: 'es', native: 'en', heard: 'a'.repeat(401) }],
  ];

  for (const [name, payload] of rejected) {
    it(`rejects ${name}`, () => {
      assert.equal(parseTutorRequest(payload), undefined);
    });
  }

  it('accepts an ordinary request', () => {
    const parsed = parseTutorRequest({ learning: 'es', native: 'en', heard: 'hola' });

    assert.equal(parsed?.learning, 'es');
    assert.equal(parsed?.heard, 'hola');
  });

  it('trims the thread rather than forwarding an unbounded one', () => {
    // An unbounded history is an unbounded bill.
    const history = Array.from({ length: 40 }, (_, i) => ({ role: 'learner', text: `turn ${i}` }));
    const parsed = parseTutorRequest({ learning: 'es', native: 'en', heard: 'hola', history });

    assert.ok((parsed?.history.length ?? 0) <= 8, 'the thread must be capped');
  });

  it('returns 400 over HTTP for a malformed request', async () => {
    const response = await post({ learning: 'es' });
    assert.equal(response.status, 400);
  });
});

describe('the credential never comes back out', () => {
  it('says nothing about the key when the provider fails', async () => {
    const response = await ask('boom');
    const text = await response.text();

    assert.equal(response.status, 503);
    assert.equal(text.includes(SECRET), false, 'the key reached the client');
    assert.equal(text.includes('sk-'), false);
    assert.equal(text.toLowerCase().includes('openai'), false, 'the vendor was named');
  });

  it('serves a plain refusal when the deployment has no tutor at all', async () => {
    const handler = createRequestHandler({
      config,
      provider: createFakeProvider(),
      languages,
      tutorRateLimiter: createRateLimiter({ max: 1000, windowMs: 60_000 }),
      // No tutor: the common case for a deployment that only translates.
    });
    const local = createServer((request, response) => void handler(request, response));
    await new Promise<void>((resolve) => local.listen(0, '127.0.0.1', resolve));
    const address = local.address();
    const url =
      address && typeof address === 'object' ? `http://127.0.0.1:${address.port}/tutor` : '';

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ learning: 'es', native: 'en', heard: 'hola' }),
    });

    assert.equal(response.status, 503);
    await new Promise<void>((resolve) => local.close(() => resolve()));
  });

  it('never puts the key anywhere but the Authorization header', async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const provider = createOpenAiTutor({
      apiKey: SECRET,
      fetchImpl: (async (url: string, init: RequestInit) => {
        captured = { url: String(url), init };
        return {
          ok: true,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: '{"kind":"reply","reply":"hola","gloss":"hi","followUp":"¿y tú?"}',
                  },
                },
              ],
            };
          },
        } as unknown as Response;
      }) as unknown as typeof fetch,
    });

    await provider.respond({ learning: 'es', native: 'en', heard: 'hello', history: [] });

    assert.ok(captured);
    assert.equal(captured.url.includes(SECRET), false, 'the key was put in the URL');
    assert.equal(String(captured.init.body).includes(SECRET), false, 'the key was put in the body');
    assert.equal(
      (captured.init.headers as Record<string, string>).Authorization,
      `Bearer ${SECRET}`,
    );
  });
});

describe('the cost is bounded before the model is asked', () => {
  it('caps the reply length', async () => {
    let body: Record<string, unknown> = {};
    const provider = createOpenAiTutor({
      apiKey: SECRET,
      maxTokens: 123,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return {
          ok: true,
          async json() {
            return { choices: [{ message: { content: '{"kind":"declined","message":"no"}' } }] };
          },
        } as unknown as Response;
      }) as unknown as typeof fetch,
    });

    await provider.respond({ learning: 'es', native: 'en', heard: 'hello', history: [] });

    assert.equal(body.max_tokens, 123);
    // JSON back, so the reply is parsed rather than scraped out of prose.
    assert.deepEqual(body.response_format, { type: 'json_object' });
  });

  it('has its own rate limit, far tighter than translation', () => {
    const loaded = loadConfig({});

    assert.ok(loaded.tutorRateLimit.max < loaded.rateLimit.max);
    // An hour window, not a minute: this is the defence against a leaked APK.
    assert.ok(loaded.tutorRateLimit.windowMs >= 60 * 60_000);
  });

  it('is disabled unless a credential is configured', () => {
    assert.equal(loadConfig({}).tutorApiKey, undefined);
    assert.equal(loadConfig({ OPENAI_API_KEY: '  ' }).tutorApiKey, undefined);
    assert.equal(loadConfig({ OPENAI_API_KEY: 'sk-test' }).tutorApiKey, 'sk-test');
  });
});
