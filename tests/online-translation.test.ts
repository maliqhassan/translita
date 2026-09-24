import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { HttpClient, HttpResponse } from '@/services/http/http-client';
import type { NetworkService, NetworkStatus } from '@/services/network/network-service';
import { withCache } from '@/services/translation/caching-router';
import { createOnlineTranslationService } from '@/services/translation/online-translation-service';
import { createBackendTranslationProvider } from '@/services/translation/provider/backend-translation-provider';
import {
  ONLINE_UNSUPPORTED,
  isOnlinePairSupported,
  isOnlineSupported,
  onlineSupportedCount,
} from '@/services/translation/provider/online-language-support';
import { createMemoryTranslationCache } from '@/services/translation/translation-cache';
import { createTranslationRouter } from '@/services/translation/translation-router';
import type { TranslationRequest } from '@/types';
import { err, ok } from '@/utils';

/** Day 5: the mobile side of the real online path, against a faked backend. */

const retry = { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 };
const noSleep = async () => {};
const BASE_URL = 'https://api.example.test';

const request: TranslationRequest = {
  text: 'Hello, how are you?',
  sourceLanguage: 'en',
  targetLanguage: 'de',
  origin: 'text',
};

const networkOf = (status: NetworkStatus): NetworkService => ({
  id: 'network.test',
  isAvailable: async () => true,
  getStatus: async () => status,
  subscribe: () => () => {},
});

const json = (data: unknown, status = 200): HttpResponse => ({
  status,
  ok: status >= 200 && status < 300,
  data,
});

/** A transport that replays scripted backend responses and records requests. */
function fakeBackend(responses: (HttpResponse | 'network-failure')[]) {
  const sent: { url: string; body: unknown }[] = [];
  let index = 0;

  const http: HttpClient = {
    async send(outgoing) {
      sent.push({ url: outgoing.url, body: outgoing.body });
      const next = responses[Math.min(index, responses.length - 1)];
      index += 1;
      if (next === 'network-failure') {
        return err({ code: 'network_unavailable', message: 'no route' });
      }
      return ok(next as HttpResponse);
    },
  };

  return { http, sent, calls: () => index };
}

function onlineWith(
  responses: (HttpResponse | 'network-failure')[],
  status: NetworkStatus = 'online',
) {
  const backend = fakeBackend(responses);
  const provider = createBackendTranslationProvider({
    baseUrl: BASE_URL,
    translatePath: '/translation',
    http: backend.http,
  });
  return {
    ...backend,
    provider,
    service: createOnlineTranslationService({
      provider,
      network: networkOf(status),
      retry,
      sleep: noSleep,
    }),
  };
}

describe('online translation success', () => {
  it('returns a real translation from the backend', async () => {
    const { service } = onlineWith([
      json({
        translatedText: 'Hallo, wie geht es dir?',
        sourceLanguage: 'en',
        targetLanguage: 'de',
      }),
    ]);

    const result = await service.translate(request);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.value.translatedText, 'Hallo, wie geht es dir?');
    assert.equal(result.value.engine, 'online');
    assert.equal(result.value.sourceText, 'Hello, how are you?');
  });

  it('sends the Translita contract, not a provider payload', async () => {
    const { service, sent } = onlineWith([json({ translatedText: 'Hallo' })]);
    await service.translate(request);

    assert.equal(sent[0]?.url, `${BASE_URL}/translation`);
    assert.deepEqual(sent[0]?.body, {
      sourceLanguage: 'en',
      targetLanguage: 'de',
      text: 'Hello, how are you?',
    });
  });

  it('carries a detected language through', async () => {
    const { service } = onlineWith([json({ translatedText: 'Hallo', detectedLanguage: 'en' })]);
    const result = await service.translate({ ...request, sourceLanguage: 'auto' });
    assert.equal(result.ok && result.value.detectedLanguage, 'en');
  });

  it('covers the required routes', async () => {
    for (const [source, target, expected] of [
      ['en', 'de', 'Hallo, wie geht es dir?'],
      ['de', 'en', 'Hello, how are you?'],
      ['en', 'es', 'Hola, ¿cómo estás?'],
      ['es', 'fr', 'Bonjour, comment allez-vous ?'],
    ]) {
      const { service } = onlineWith([json({ translatedText: expected as string })]);
      const result = await service.translate({
        ...request,
        sourceLanguage: source as string,
        targetLanguage: target as string,
      });
      assert.equal(result.ok, true, `${source} -> ${target}`);
      assert.equal(result.ok && result.value.translatedText, expected);
    }
  });
});

describe('online translation errors', () => {
  it('maps a backend unsupported_language onto the app error', async () => {
    const { service } = onlineWith([
      json({ error: { code: 'unsupported_language', message: 'nope' } }, 422),
    ]);
    const result = await service.translate(request);
    assert.equal(!result.ok && result.error.code, 'unsupported_language');
  });

  it('maps a backend rate limit without retrying it', async () => {
    const { service, calls } = onlineWith([
      json({ error: { code: 'rate_limited', message: 'slow down' } }, 429),
    ]);
    const result = await service.translate(request);
    assert.equal(!result.ok && result.error.code, 'rate_limited');
    assert.equal(calls(), 1, 'a rate limit must not be retried');
  });

  it('never surfaces backend or provider internals', async () => {
    const { service } = onlineWith([
      json({ error: { code: 'provider_error', message: 'Azure said 500 for key abc' } }, 502),
    ]);
    const result = await service.translate(request);
    assert.equal(result.ok, false);
    if (result.ok) return;
    // The app maps on the code; the backend's wording never becomes UI copy.
    assert.ok(!result.error.message.includes('Azure'));
    assert.ok(!result.error.message.includes('abc'));
  });

  it('reports a malformed backend body as invalid_response', async () => {
    const { service } = onlineWith([json({ nothing: 'useful' })]);
    const result = await service.translate(request);
    assert.equal(!result.ok && result.error.code, 'invalid_response');
  });

  it('reports a network failure', async () => {
    const { service } = onlineWith(['network-failure']);
    const result = await service.translate(request);
    assert.equal(!result.ok && result.error.code, 'network_unavailable');
  });
});

describe('retry and timeout', () => {
  it('retries a backend 503 and then succeeds', async () => {
    const { service, calls } = onlineWith([
      json({ error: { code: 'provider_unavailable', message: 'busy' } }, 503),
      json({ translatedText: 'Hallo' }),
    ]);
    const result = await service.translate(request);
    assert.equal(result.ok && result.value.translatedText, 'Hallo');
    assert.equal(calls(), 2);
  });

  it('retries a transient network failure', async () => {
    const { service, calls } = onlineWith(['network-failure', json({ translatedText: 'Hallo' })]);
    const result = await service.translate(request);
    assert.equal(result.ok, true);
    assert.equal(calls(), 2);
  });

  it('gives up after maxAttempts', async () => {
    const { service, calls } = onlineWith(['network-failure']);
    const result = await service.translate(request);
    assert.equal(result.ok, false);
    assert.equal(calls(), 3);
  });

  it('surfaces a transport timeout unchanged', async () => {
    const http: HttpClient = {
      async send() {
        return err({ code: 'timeout', message: 'took too long' });
      },
    };
    const service = createOnlineTranslationService({
      provider: createBackendTranslationProvider({
        baseUrl: BASE_URL,
        translatePath: '/translation',
        http,
      }),
      network: networkOf('online'),
      retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
      sleep: noSleep,
    });
    const result = await service.translate(request);
    assert.equal(!result.ok && result.error.code, 'timeout');
  });
});

describe('provider language support', () => {
  it('supports most of the catalogue', () => {
    assert.ok(onlineSupportedCount() >= 85, `only ${onlineSupportedCount()} supported`);
  });

  it('reports catalogue languages the provider cannot handle', () => {
    assert.ok(ONLINE_UNSUPPORTED.length > 0);
    for (const id of ONLINE_UNSUPPORTED) assert.equal(isOnlineSupported(id), false, id);
  });

  it('handles script and region variants', () => {
    for (const id of ['zh-Hans', 'zh-Hant', 'pt-BR', 'pt-PT']) {
      assert.equal(isOnlineSupported(id), true, id);
    }
  });

  it('treats auto-detect as a valid source only', () => {
    assert.equal(isOnlineSupported('auto'), true);
    assert.equal(isOnlinePairSupported('auto', 'de'), true);
    assert.equal(isOnlinePairSupported('en', 'auto'), false);
  });

  it('refuses a same-to-same pair', () => {
    assert.equal(isOnlinePairSupported('en', 'en'), false);
  });

  it('refuses unknown languages', () => {
    assert.equal(isOnlineSupported('not-a-language'), false);
  });

  it('stops an unsupported pair before a request is sent', async () => {
    const { provider } = onlineWith([json({ translatedText: 'x' })]);
    // Javanese is in the catalogue but not supported by the provider.
    assert.equal(await provider.supportsPair('en', 'jv'), false);
    assert.equal(await provider.supportsPair('en', 'de'), true);
  });
});

describe('router with the online engine', () => {
  const routerFor = (responses: (HttpResponse | 'network-failure')[], status: NetworkStatus) => {
    const { service, calls } = onlineWith(responses, status);
    return {
      router: createTranslationRouter({ engines: [service], network: networkOf(status) }),
      calls,
    };
  };

  it('routes to the online engine when connected', async () => {
    const { router } = routerFor([json({ translatedText: 'Hallo' })], 'online');
    const result = await router.translate(request);
    assert.equal(result.ok && result.value.engine, 'online');
  });

  it('attempts online when connectivity is unknown', async () => {
    const { router, calls } = routerFor([json({ translatedText: 'Hallo' })], 'unknown');
    const result = await router.translate(request);
    assert.equal(result.ok, true);
    assert.equal(calls(), 1, 'unknown should still try');
  });

  it('reports a friendly offline failure with no offline engine', async () => {
    const { router, calls } = routerFor([json({ translatedText: 'Hallo' })], 'offline');
    const result = await router.translate(request);
    assert.equal(!result.ok && result.error.code, 'network_unavailable');
    assert.equal(calls(), 0, 'nothing should be sent while offline');
  });

  it('rejects an unsupported pair without calling the backend', async () => {
    const { router, calls } = routerFor([json({ translatedText: 'x' })], 'online');
    const result = await router.translate({ ...request, targetLanguage: 'jv' });
    assert.equal(!result.ok && result.error.code, 'unsupported_language');
    assert.equal(calls(), 0);
  });
});

describe('cache over the online engine', () => {
  it('misses, then hits without a second backend call', async () => {
    const { service, calls } = onlineWith([json({ translatedText: 'Hallo' })]);
    const cached = withCache(createTranslationRouter({ engines: [service] }), {
      cache: createMemoryTranslationCache({ maxEntries: 10 }),
    });

    const first = await cached.translate(request);
    const second = await cached.translate(request);

    assert.equal(first.ok && second.ok, true);
    assert.equal(calls(), 1, 'second request served from cache');
    assert.equal(first.ok && second.ok && first.value.id, second.ok ? second.value.id : '');
  });

  it('does not cache a failed translation', async () => {
    const { service, calls } = onlineWith([json({ nothing: 'useful' })]);
    const cached = withCache(createTranslationRouter({ engines: [service] }), {
      cache: createMemoryTranslationCache({ maxEntries: 10 }),
    });

    await cached.translate(request);
    await cached.translate(request);
    assert.equal(calls(), 2, 'a failure must not be remembered');
  });
});
