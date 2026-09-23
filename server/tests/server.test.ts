import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { after, before, describe, it } from 'node:test';

import { describeConfig, loadConfig } from '../src/config';
import { createRateLimiter } from '../src/rate-limit';
import { createRequestHandler } from '../src/server';
import { createFakeProvider } from '../src/translation/fake-provider';
import { createLanguageResolver, loadLanguageMap } from '../src/translation/language-map';

/** Exercises the real HTTP surface over a loopback server. */

const languages = createLanguageResolver(loadLanguageMap());
const config = loadConfig({ TRANSLATION_PROVIDER: 'fake' });

let server: Server;
let baseUrl = '';

before(async () => {
  const handler = createRequestHandler({
    config,
    provider: createFakeProvider(),
    languages,
    // Generous: this server is shared by every test below. The limiter itself
    // is exercised on its own server further down.
    rateLimiter: createRateLimiter({ max: 1000, windowMs: 60_000 }),
  });

  server = createServer((request, response) => void handler(request, response));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address && typeof address === 'object') baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** `Response.json()` is `unknown`; these tests know the shape they asked for. */
async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

type ErrorBody = { error: { code: string; message: string } };

const post = (body: unknown, raw?: string) =>
  fetch(`${baseUrl}/translation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });

describe('POST /translation', () => {
  it('translates a valid request', async () => {
    const response = await post({ sourceLanguage: 'en', targetLanguage: 'de', text: 'Hello' });
    assert.equal(response.status, 200);
    assert.deepEqual(await readJson(response), {
      translatedText: '[de] Hello',
      sourceLanguage: 'en',
      targetLanguage: 'de',
    });
  });

  it('rejects empty text with 400', async () => {
    const response = await post({ sourceLanguage: 'en', targetLanguage: 'de', text: '  ' });
    assert.equal(response.status, 400);
    assert.equal((await readJson<ErrorBody>(response)).error.code, 'invalid_request');
  });

  it('rejects oversized text with 413', async () => {
    const response = await post({
      sourceLanguage: 'en',
      targetLanguage: 'de',
      text: 'a'.repeat(5001),
    });
    assert.equal(response.status, 413);
    assert.equal((await readJson<ErrorBody>(response)).error.code, 'text_too_long');
  });

  it('rejects an unsupported language with 422', async () => {
    const response = await post({ sourceLanguage: 'en', targetLanguage: 'jv', text: 'Hello' });
    assert.equal(response.status, 422);
    assert.equal((await readJson<ErrorBody>(response)).error.code, 'unsupported_language');
  });

  it('rejects malformed JSON with 400', async () => {
    const response = await post(undefined, '{not json');
    assert.equal(response.status, 400);
    assert.equal((await readJson<ErrorBody>(response)).error.code, 'invalid_request');
  });

  it('rejects an empty body with 400', async () => {
    const response = await post(undefined, '');
    assert.equal(response.status, 400);
  });

  it('caps the request body size', async () => {
    const response = await post(undefined, JSON.stringify({ text: 'a'.repeat(200_000) }));
    assert.ok(response.status === 413 || response.status === 400, `got ${response.status}`);
  });

  it('never returns anything credential-shaped', async () => {
    const response = await post({ sourceLanguage: 'en', targetLanguage: 'de', text: 'Hello' });
    const body = JSON.stringify(await readJson(response)).toLowerCase();
    for (const forbidden of [
      'api_key',
      'apikey',
      'secret',
      'bearer',
      'authorization',
      'subscription-key',
      'password',
    ]) {
      assert.ok(!body.includes(forbidden), `response must not contain "${forbidden}"`);
    }
  });

  it('does not echo request headers back', async () => {
    const response = await fetch(`${baseUrl}/translation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer leak-me' },
      body: JSON.stringify({ sourceLanguage: 'en', targetLanguage: 'de', text: 'Hello' }),
    });
    assert.ok(!JSON.stringify(await readJson(response)).includes('leak-me'));
  });
});

describe('routing', () => {
  it('serves health without revealing credential state', async () => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    const body = await readJson<{ status: string }>(response);
    assert.equal(body.status, 'ok');
    assert.ok(!('providerApiKey' in body) && !('credential' in body));
  });

  it('lists supported languages', async () => {
    const response = await fetch(`${baseUrl}/languages`);
    assert.equal(response.status, 200);
    const body = await readJson<{ languages: string[] }>(response);
    assert.ok(Array.isArray(body.languages));
    assert.ok(body.languages.includes('de'));
    assert.ok(!body.languages.includes('jv'));
  });

  it('404s an unknown route', async () => {
    const response = await fetch(`${baseUrl}/nope`);
    assert.equal(response.status, 404);
  });

  it('rejects the wrong method on /translation', async () => {
    const response = await fetch(`${baseUrl}/translation`);
    assert.equal(response.status, 400);
  });
});

describe('rate limiting', () => {
  it('returns 429 with Retry-After once the window is exhausted', async () => {
    const handler = createRequestHandler({
      config,
      provider: createFakeProvider(),
      languages,
      rateLimiter: createRateLimiter({ max: 2, windowMs: 60_000 }),
    });
    const local = createServer((request, response) => void handler(request, response));
    await new Promise<void>((resolve) => local.listen(0, '127.0.0.1', resolve));
    const address = local.address();
    const url =
      address && typeof address === 'object' ? `http://127.0.0.1:${address.port}/translation` : '';

    const send = () =>
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceLanguage: 'en', targetLanguage: 'de', text: 'Hello' }),
      });

    assert.equal((await send()).status, 200);
    assert.equal((await send()).status, 200);

    const limited = await send();
    assert.equal(limited.status, 429);
    assert.equal((await readJson<ErrorBody>(limited)).error.code, 'rate_limited');
    assert.ok(Number(limited.headers.get('Retry-After')) >= 1);

    await new Promise<void>((resolve) => local.close(() => resolve()));
  });
});

describe('rate limiter unit', () => {
  it('allows up to the limit, then blocks', () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 3, windowMs: 1000, now: () => now });
    for (let i = 0; i < 3; i += 1) assert.equal(limiter.check('a').allowed, true, `hit ${i}`);
    assert.equal(limiter.check('a').allowed, false);
  });

  it('keeps clients independent', () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => now });
    assert.equal(limiter.check('a').allowed, true);
    assert.equal(limiter.check('b').allowed, true);
    assert.equal(limiter.check('a').allowed, false);
  });

  it('resets after the window', () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => now });
    assert.equal(limiter.check('a').allowed, true);
    assert.equal(limiter.check('a').allowed, false);
    now = 1001;
    assert.equal(limiter.check('a').allowed, true);
  });

  it('sweeps expired windows so the map cannot grow forever', () => {
    let now = 0;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => now });
    limiter.check('a');
    limiter.check('b');
    assert.equal(limiter.size, 2);
    now = 2000;
    limiter.sweep();
    assert.equal(limiter.size, 0);
  });

  it('reclaims expired windows on its own once the map has grown', () => {
    // `sweep` had no production caller, so every client address seen was kept
    // for the life of the process. Checking does the reclaiming now, which is
    // why no timer has to be created, unref'd and torn down by the caller.
    let now = 0;
    const limiter = createRateLimiter({ max: 1, windowMs: 1000, now: () => now });

    for (let i = 0; i < 1_200; i += 1) limiter.check(`client-${i}`);
    const grown = limiter.size;
    assert.ok(grown > 1_000, `expected the map to grow first, saw ${grown}`);

    // Every window above is now expired; one more check should clear them.
    now = 5_000;
    limiter.check('someone-new');

    assert.ok(limiter.size < grown, `expected a reclaim, size stayed ${limiter.size}`);
    assert.equal(limiter.size, 1, 'only the live window survives');
  });

  it('still rate limits correctly across a reclaim', () => {
    // The sweep must not drop a window that is still counting, or a client
    // would get a fresh allowance simply because the service was busy.
    let now = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, now: () => now });

    assert.equal(limiter.check('watched').allowed, true);
    assert.equal(limiter.check('watched').allowed, true);

    // Grow the map past the threshold while the watched window is still open.
    for (let i = 0; i < 1_200; i += 1) limiter.check(`filler-${i}`);

    assert.equal(limiter.check('watched').allowed, false, 'the third call is over the limit');
  });
});

describe('config', () => {
  it('never exposes the credential in its summary', () => {
    const summary = describeConfig(
      loadConfig({ TRANSLATION_PROVIDER_API_KEY: 'super-secret-value' }),
    );
    assert.ok(!summary.includes('super-secret-value'));
    assert.ok(summary.includes('credential=configured'));
  });

  it('reports a missing credential without inventing one', () => {
    const loaded = loadConfig({});
    assert.equal(loaded.providerApiKey, undefined);
  });
});
