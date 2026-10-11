import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { TRANSLATION_CONFIG } from '@/constants';
import { shouldWarmServer } from '@/features/translation/server-warmup';
import type { HttpClient, HttpRequest } from '@/services/http';
import { createServerWarmupService } from '@/services/warmup';
import { appError, err, ok } from '@/utils';

/**
 * Waking the translation server when the app opens or comes back, so the
 * first translation of a visit does not wait for it to start.
 */

const read = (path: string) => readFileSync(path, 'utf8');

/** Source with block comments and comment-only lines removed. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

function fakeHttp(answer: 'healthy' | 'error-status' | 'unreachable'): HttpClient & {
  sent: HttpRequest[];
} {
  const sent: HttpRequest[] = [];
  return {
    sent,
    async send(request) {
      sent.push(request);
      if (answer === 'unreachable') return err(appError('network_unavailable', 'no route'));
      const status = answer === 'healthy' ? 200 : 503;
      return ok({ status, ok: status === 200, data: undefined });
    },
  };
}

const MINUTE = 60_000;
const base = {
  mode: 'auto' as const,
  network: 'online' as const,
  lastWarmAt: undefined,
  now: 100 * MINUTE,
  intervalMs: 10 * MINUTE,
};

describe('when to wake the server', () => {
  it('wakes it the first time the app opens', () => {
    assert.equal(shouldWarmServer(base), true);
  });

  it('wakes it again on a return after the interval has passed', () => {
    assert.equal(shouldWarmServer({ ...base, lastWarmAt: base.now - 11 * MINUTE }), true);
  });

  it('does not ping again within the interval', () => {
    assert.equal(shouldWarmServer({ ...base, lastWarmAt: base.now - 2 * MINUTE }), false);
  });

  it('leaves the server alone for someone who chose offline-only', () => {
    assert.equal(shouldWarmServer({ ...base, mode: 'offline' }), false);
  });

  it('does not try with no connection, but does with an unknown one', () => {
    assert.equal(shouldWarmServer({ ...base, network: 'offline' }), false);
    assert.equal(shouldWarmServer({ ...base, network: 'unknown' }), true);
  });

  it('pings well inside the server’s fifteen-minute idle limit', () => {
    assert.ok(TRANSLATION_CONFIG.warmup.intervalMs < 15 * MINUTE);
  });
});

describe('the wake-up request', () => {
  it('is a bare GET of the health check, carrying nothing about the user', async () => {
    const http = fakeHttp('healthy');
    const service = createServerWarmupService({
      baseUrl: 'https://api.example.test/',
      path: '/health',
      timeoutMs: 60_000,
      http,
    });

    const result = await service.warm();

    assert.deepEqual(result, ok(true));
    assert.equal(http.sent.length, 1);
    const [request] = http.sent;
    assert.equal(request?.url, 'https://api.example.test/health');
    assert.equal(request?.method, 'GET');
    assert.equal(request?.body, undefined);
    assert.equal(request?.timeoutMs, 60_000);
  });

  it('waits long enough for a full wake-up rather than giving up early', () => {
    assert.ok(TRANSLATION_CONFIG.warmup.timeoutMs >= 30_000);
  });

  it('sends nothing at all in a build with no backend', async () => {
    const http = fakeHttp('healthy');
    const service = createServerWarmupService({
      baseUrl: undefined,
      path: '/health',
      timeoutMs: 60_000,
      http,
    });

    assert.deepEqual(await service.warm(), ok(false));
    assert.equal(http.sent.length, 0);
    assert.equal(await service.isAvailable(), false);
  });

  it('reports an error status or no connection without throwing', async () => {
    const options = { baseUrl: 'https://api.example.test', path: '/health', timeoutMs: 60_000 };

    const unhealthy = await createServerWarmupService({
      ...options,
      http: fakeHttp('error-status'),
    }).warm();
    assert.deepEqual(unhealthy, ok(false));

    const unreachable = await createServerWarmupService({
      ...options,
      http: fakeHttp('unreachable'),
    }).warm();
    assert.equal(unreachable.ok, false);
  });
});

describe('where the wake-up runs', () => {
  const COMPONENT = 'src/features/translation/components/server-warmup.tsx';

  it('is mounted at the root, outside the onboarding gate', () => {
    const layout = code('app/_layout.tsx');

    assert.match(layout, /<ServerWarmup \/>\s*<RootNavigator \/>/);
  });

  it('fires on opening and on every return from the background', () => {
    const component = code(COMPONENT);

    assert.match(component, /void warm\(\);\s*let current = AppState\.currentState;/);
    assert.match(component, /if \(current !== 'active' && next === 'active'\) void warm\(\);/);
  });

  it('never makes the user wait for it', () => {
    // Fire and forget: the result is not awaited by anything on screen.
    assert.match(code(COMPONENT), /void services\.serverWarmup\.warm\(\);/);
  });

  it('decides through the tested rule, not ad hoc', () => {
    const component = code(COMPONENT);

    assert.match(component, /shouldWarmServer\(\{/);
    assert.match(component, /intervalMs: TRANSLATION_CONFIG\.warmup\.intervalMs/);
  });
});
