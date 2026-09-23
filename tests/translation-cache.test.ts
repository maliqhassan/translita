import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { withCache } from '@/services/translation/caching-router';
import { createInFlightRegistry } from '@/services/translation/in-flight-requests';
import {
  createMemoryTranslationCache,
  createNullTranslationCache,
} from '@/services/translation/translation-cache';
import type { NormalizedTranslationRequest } from '@/services/translation/translation-request';
import type { TranslationResult } from '@/types';
import { appError, err, ok } from '@/utils';

const request = (text: string, target = 'de'): NormalizedTranslationRequest => ({
  text,
  sourceLanguage: 'en',
  targetLanguage: target,
  origin: 'text',
});

const result = (translatedText: string): TranslationResult => ({
  id: `id-${translatedText}`,
  sourceText: 'source',
  translatedText,
  sourceLanguage: 'en',
  targetLanguage: 'de',
  engine: 'mock',
  origin: 'text',
  createdAt: 0,
});

describe('memory translation cache', () => {
  it('misses on an empty cache', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 10 });
    assert.equal(await cache.get(request('Hello')), undefined);
  });

  it('hits on a stored request', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 10 });
    await cache.set(request('Hello'), result('Hallo'));
    const hit = await cache.get(request('Hello'));
    assert.equal(hit?.translatedText, 'Hallo');
  });

  it('keys on the language pair, not just the text', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 10 });
    await cache.set(request('Hello', 'de'), result('Hallo'));
    assert.equal(await cache.get(request('Hello', 'fr')), undefined);
  });

  it('overwrites rather than duplicating the same key', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 10 });
    await cache.set(request('Hello'), result('first'));
    await cache.set(request('Hello'), result('second'));
    assert.equal((await cache.get(request('Hello')))?.translatedText, 'second');
  });

  it('evicts the least recently used entry past the limit', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 2 });
    await cache.set(request('one'), result('1'));
    await cache.set(request('two'), result('2'));

    // Touch "one" so "two" becomes the least recently used.
    await cache.get(request('one'));
    await cache.set(request('three'), result('3'));

    assert.ok(await cache.get(request('one')), 'recently used entry survives');
    assert.equal(await cache.get(request('two')), undefined, 'LRU entry evicted');
    assert.ok(await cache.get(request('three')));
  });

  it('clears everything', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 10 });
    await cache.set(request('Hello'), result('Hallo'));
    await cache.clear();
    assert.equal(await cache.get(request('Hello')), undefined);
  });
});

describe('null translation cache', () => {
  it('never stores anything', async () => {
    const cache = createNullTranslationCache();
    await cache.set(request('Hello'), result('Hallo'));
    assert.equal(await cache.get(request('Hello')), undefined);
  });
});

describe('in-flight registry', () => {
  it('shares one operation between concurrent identical calls', async () => {
    const registry = createInFlightRegistry();
    let calls = 0;

    const operation = async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return 'value';
    };

    const [a, b, c] = await Promise.all([
      registry.run('key', operation),
      registry.run('key', operation),
      registry.run('key', operation),
    ]);

    assert.equal(calls, 1, 'only one call should have run');
    assert.deepEqual([a, b, c], ['value', 'value', 'value']);
  });

  it('keeps different keys independent', async () => {
    const registry = createInFlightRegistry();
    let calls = 0;
    const operation = async () => {
      calls += 1;
      return calls;
    };

    await Promise.all([registry.run('a', operation), registry.run('b', operation)]);
    assert.equal(calls, 2);
  });

  it('releases the slot once settled, so it is not a cache', async () => {
    const registry = createInFlightRegistry();
    let calls = 0;
    const operation = async () => {
      calls += 1;
      return calls;
    };

    await registry.run('key', operation);
    assert.equal(registry.size, 0, 'slot released');
    await registry.run('key', operation);
    assert.equal(calls, 2, 'second sequential call runs again');
  });

  it('releases the slot when the operation rejects', async () => {
    const registry = createInFlightRegistry();
    await assert.rejects(() => registry.run('key', async () => Promise.reject(new Error('boom'))));
    assert.equal(registry.size, 0);
  });
});

/**
 * Step 2C: the cache sits above the router, so it is a bypass of its own.
 *
 * An on-device translation earned under Pro would otherwise keep being handed
 * back after the plan lapsed, without the routing policy ever being consulted.
 */
describe('cached on-device results respect the entitlement', () => {
  const offlineResult = (text: string): TranslationResult => ({
    ...result(text),
    engine: 'offline',
  });

  const onlineResult = (text: string): TranslationResult => ({
    ...result(text),
    engine: 'online',
  });

  /** A router that records what reached it and answers with a fresh result. */
  function countingRouter(answer: TranslationResult) {
    let calls = 0;
    return {
      calls: () => calls,
      router: {
        async translate() {
          calls += 1;
          return ok(answer);
        },
        async resolveEngine() {
          return answer.engine;
        },
      },
    };
  }

  it('serves a cached on-device result while still entitled', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 8 });
    await cache.set(request('Hello'), offlineResult('Hallo'));

    const { router, calls } = countingRouter(onlineResult('from-router'));
    const cached = withCache(router, { cache, offlineEntitled: () => true });

    const got = await cached.translate({ ...request('Hello'), origin: 'text' });

    assert.equal(got.ok && got.value.translatedText, 'Hallo');
    assert.equal(calls(), 0, 'the cache answered');
  });

  it('refuses a cached on-device result after the entitlement is lost', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 8 });
    // Earned while Pro.
    await cache.set(request('Hello'), offlineResult('Hallo'));

    const { router, calls } = countingRouter(onlineResult('from-router'));
    const cached = withCache(router, { cache, offlineEntitled: () => false });

    const got = await cached.translate({ ...request('Hello'), origin: 'text' });

    assert.equal(got.ok && got.value.translatedText, 'from-router');
    assert.notEqual(got.ok && got.value.engine, 'offline');
    assert.equal(calls(), 1, 'the request fell through to the router, which gates properly');
  });

  it('still serves the online entries sitting beside it', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 8 });
    await cache.set(request('Hello'), onlineResult('Hallo'));

    const { router, calls } = countingRouter(onlineResult('from-router'));
    const cached = withCache(router, { cache, offlineEntitled: () => false });

    const got = await cached.translate({ ...request('Hello'), origin: 'text' });

    assert.equal(got.ok && got.value.translatedText, 'Hallo');
    assert.equal(calls(), 0, 'only on-device entries are in question');
  });

  it('leaves the refused entry in place rather than evicting it', async () => {
    // The realistic shape of a refusal today: nothing else can serve the pair,
    // so the router fails and there is no new result to store. The stored
    // on-device entry must survive that, because resubscribing should get the
    // cache back rather than a cache someone purged on the way past.
    const cache = createMemoryTranslationCache({ maxEntries: 8 });
    await cache.set(request('Hello'), offlineResult('Hallo'));

    let entitled = false;
    const failing = {
      async translate() {
        return err(appError('service_unavailable', 'nothing can serve this'));
      },
      async resolveEngine() {
        return 'online' as const;
      },
    };
    const cached = withCache(failing, { cache, offlineEntitled: () => entitled });

    const refused = await cached.translate({ ...request('Hello'), origin: 'text' });
    assert.equal(refused.ok, false, 'the free user gets an error, not the cached translation');

    entitled = true;
    const stored = await cache.get(request('Hello'));
    assert.equal(stored?.translatedText, 'Hallo', 'nothing was thrown away');
  });

  it('replaces the refused entry when a new result does arrive', async () => {
    // A successful re-translation is cached as normal, so the stale on-device
    // entry is superseded rather than lingering behind a newer answer.
    const cache = createMemoryTranslationCache({ maxEntries: 8 });
    await cache.set(request('Hello'), offlineResult('Hallo'));

    const { router } = countingRouter(onlineResult('from-router'));
    const cached = withCache(router, { cache, offlineEntitled: () => false });

    await cached.translate({ ...request('Hello'), origin: 'text' });

    const stored = await cache.get(request('Hello'));
    assert.equal(stored?.translatedText, 'from-router');
    assert.equal(stored?.engine, 'online');
  });

  it('asks on every read, so a plan change lands on the next request', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 8 });
    await cache.set(request('Hello'), offlineResult('Hallo'));

    let entitled = true;
    const { router } = countingRouter(onlineResult('from-router'));
    const cached = withCache(router, { cache, offlineEntitled: () => entitled });

    const first = await cached.translate({ ...request('Hello'), origin: 'text' });
    assert.equal(first.ok && first.value.translatedText, 'Hallo');

    entitled = false;

    const second = await cached.translate({ ...request('Hello'), origin: 'text' });
    assert.equal(second.ok && second.value.translatedText, 'from-router');
  });

  it('behaves exactly as before when no getter is supplied', async () => {
    const cache = createMemoryTranslationCache({ maxEntries: 8 });
    await cache.set(request('Hello'), offlineResult('Hallo'));

    const { router, calls } = countingRouter(onlineResult('from-router'));
    const cached = withCache(router, { cache });

    const got = await cached.translate({ ...request('Hello'), origin: 'text' });

    assert.equal(got.ok && got.value.translatedText, 'Hallo');
    assert.equal(calls(), 0);
  });
});

/**
 * The in-flight join, and the entitlement hole it used to open.
 *
 * Two identical requests share one translation. The joiner never called
 * `mayServe`, so it could be handed an on-device result across a loss of
 * entitlement that happened while the original was still running.
 *
 * The originator is deliberately still exempt: its translation began while the
 * entitlement held, and an in-flight request is allowed to finish rather than
 * being cancelled. These pin both halves of that.
 */
describe('a request that joins one already in flight', () => {
  const offline = (text: string): TranslationResult => ({ ...result(text), engine: 'offline' });

  /**
   * A router whose translation is held open until released.
   *
   * It consults the same entitlement the cache does, so a call made after the
   * plan lapses refuses exactly as the real routing policy would — without
   * reaching an engine.
   */
  function heldRouter(entitled: () => boolean) {
    let calls = 0;

    /*
     * The gate is created up front rather than inside `translate`.
     *
     * Capturing the resolver when the router is entered looks equivalent and
     * is not: `withCache` awaits the cache read before it ever calls the
     * router, so a test that releases immediately can do so while the resolver
     * is still undefined — and the translation then never settles. Creating it
     * here makes `release` safe to call at any point, including before anyone
     * is waiting on it.
     */
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    return {
      calls: () => calls,
      release: () => release(),
      router: {
        async translate() {
          calls += 1;

          if (!entitled()) {
            return err(appError('entitlement_required', 'On-device translation is part of Pro.'));
          }

          await gate;

          return ok(offline('Hallo'));
        },
        async resolveEngine() {
          return 'offline' as const;
        },
      },
    };
  }

  const request = (text: string) => ({
    text,
    sourceLanguage: 'en',
    targetLanguage: 'de',
    origin: 'text' as const,
  });

  /**
   * Lets both calls reach the in-flight registry before the test acts.
   *
   * `withCache` awaits the cache read before it ever reaches `inFlight.run`,
   * so a test that releases or changes the plan immediately would do so while
   * the second call has not joined yet — and would be testing two separate
   * translations rather than a shared one.
   */
  const inFlightNow = () => new Promise((resolve) => setTimeout(resolve, 0));

  it('shares one translation when the entitlement holds throughout', async () => {
    const entitled = () => true;
    const { router, release, calls } = heldRouter(entitled);
    const cached = withCache(router, {
      cache: createMemoryTranslationCache({ maxEntries: 8 }),
      inFlight: createInFlightRegistry(),
      offlineEntitled: entitled,
    });

    const first = cached.translate(request('Hello'));
    const second = cached.translate(request('Hello'));
    await inFlightNow();

    release();
    const [a, b] = await Promise.all([first, second]);

    assert.equal(a.ok && a.value.translatedText, 'Hallo');
    assert.equal(b.ok && b.value.translatedText, 'Hallo');
    assert.equal(calls(), 1, 'the work was shared, not duplicated');
  });

  it('refuses the joiner when the entitlement is lost mid-flight', async () => {
    let entitled = true;
    const { router, release } = heldRouter(() => entitled);
    const cached = withCache(router, {
      cache: createMemoryTranslationCache({ maxEntries: 8 }),
      inFlight: createInFlightRegistry(),
      offlineEntitled: () => entitled,
    });

    const originator = cached.translate(request('Hello'));
    const joiner = cached.translate(request('Hello'));
    await inFlightNow();

    // The plan lapses while the shared translation is still running.
    entitled = false;
    release();

    const [a, b] = await Promise.all([originator, joiner]);

    // Started while entitled, so it is allowed to finish.
    assert.equal(a.ok && a.value.translatedText, 'Hallo');

    // Arrived as a new request, so it is gated like one.
    assert.equal(b.ok, false);
  });

  it('gives that joiner the established entitlement error', async () => {
    let entitled = true;
    const { router, release } = heldRouter(() => entitled);
    const cached = withCache(router, {
      cache: createMemoryTranslationCache({ maxEntries: 8 }),
      inFlight: createInFlightRegistry(),
      offlineEntitled: () => entitled,
    });

    const originator = cached.translate(request('Hello'));
    const joiner = cached.translate(request('Hello'));
    await inFlightNow();

    entitled = false;
    release();

    await originator;
    const refused = await joiner;

    // The wording is the router's, not invented by the cache decorator.
    assert.equal(!refused.ok && refused.error.code, 'entitlement_required');
  });

  it('never hands a joiner an on-device result it may not have', async () => {
    let entitled = true;
    const { router, release } = heldRouter(() => entitled);
    const cached = withCache(router, {
      cache: createMemoryTranslationCache({ maxEntries: 8 }),
      inFlight: createInFlightRegistry(),
      offlineEntitled: () => entitled,
    });

    const originator = cached.translate(request('Hello'));
    const joiner = cached.translate(request('Hello'));
    await inFlightNow();

    entitled = false;
    release();
    await originator;

    const refused = await joiner;
    assert.equal(refused.ok && refused.value.engine === 'offline', false);
  });

  it('leaves an online result alone, because it was never in question', async () => {
    let entitled = true;
    let calls = 0;
    const onlineRouter = {
      async translate() {
        calls += 1;
        return ok({ ...result('Hallo'), engine: 'online' as const });
      },
      async resolveEngine() {
        return 'online' as const;
      },
    };

    const cached = withCache(onlineRouter, {
      cache: createMemoryTranslationCache({ maxEntries: 8 }),
      inFlight: createInFlightRegistry(),
      offlineEntitled: () => entitled,
    });

    const first = cached.translate(request('Hello'));
    const second = cached.translate(request('Hello'));
    await inFlightNow();

    entitled = false;
    const [a, b] = await Promise.all([first, second]);

    assert.equal(a.ok && a.value.translatedText, 'Hallo');
    assert.equal(b.ok && b.value.translatedText, 'Hallo');
    assert.ok(calls <= 2, 'losing offline entitlement must not re-run an online translation');
  });

  it('still releases the shared slot once the work settles', async () => {
    const entitled = () => true;
    const registry = createInFlightRegistry();
    const { router, release } = heldRouter(entitled);
    const cached = withCache(router, {
      cache: createMemoryTranslationCache({ maxEntries: 8 }),
      inFlight: registry,
      offlineEntitled: entitled,
    });

    const first = cached.translate(request('Hello'));
    const second = cached.translate(request('Hello'));
    await inFlightNow();
    assert.equal(registry.size, 1, 'both calls share one slot');

    release();
    await Promise.all([first, second]);

    assert.equal(registry.size, 0, 'the slot is dropped, so this is not a cache');
  });
});
