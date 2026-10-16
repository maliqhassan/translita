import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createFetchHttpClient } from '@/services/http/fetch-http-client';
import { httpStatusError, isAbortError } from '@/services/http/http-errors';
import { backoffDelay, isRetryable, runWithRetry } from '@/services/http/retry';
import type { AppError, AppErrorCode } from '@/types';
import { err, ok } from '@/utils';

const policy = { maxAttempts: 3, baseDelayMs: 10, maxDelayMs: 40 };
const noSleep = async () => {};
const fail = (code: AppErrorCode): AppError => ({ code, message: code });

describe('http status mapping', () => {
  it('maps statuses to the right error codes', () => {
    const cases: [number, AppErrorCode][] = [
      [400, 'invalid_request'],
      [401, 'permission_denied'],
      [403, 'permission_denied'],
      [404, 'invalid_request'],
      [408, 'timeout'],
      [422, 'unsupported_language'],
      [429, 'rate_limited'],
      [500, 'server_down'],
      [502, 'server_down'],
      [503, 'server_down'],
    ];
    for (const [status, code] of cases) {
      assert.equal(httpStatusError(status).code, code, `status ${status}`);
    }
  });

  it('never leaks the raw status into user-facing copy paths', () => {
    // The cause is kept for logs, but the code is what the UI maps on.
    const error = httpStatusError(500, new Error('ECONNRESET'));
    assert.equal(error.code, 'server_down');
    assert.ok(error.cause instanceof Error);
  });

  it('recognises abort errors', () => {
    assert.equal(isAbortError({ name: 'AbortError' }), true);
    assert.equal(isAbortError(new Error('nope')), false);
    assert.equal(isAbortError(null), false);
  });
});

describe('retry policy', () => {
  it('retries only transient failures', () => {
    for (const code of [
      'network_unavailable',
      'timeout',
      'service_unavailable',
      'server_down',
    ] as AppErrorCode[]) {
      assert.equal(isRetryable(fail(code)), true, code);
    }
  });

  it('does not retry failures a second attempt cannot fix', () => {
    const codes: AppErrorCode[] = [
      'invalid_request',
      'unsupported_language',
      'permission_denied',
      'rate_limited',
      'invalid_response',
      'model_missing',
      'not_implemented',
      'cancelled',
      'unknown',
    ];
    for (const code of codes) assert.equal(isRetryable(fail(code)), false, code);
  });

  it('backs off exponentially and caps', () => {
    assert.equal(backoffDelay(1, policy), 10);
    assert.equal(backoffDelay(2, policy), 20);
    assert.equal(backoffDelay(3, policy), 40);
    assert.equal(backoffDelay(9, policy), 40);
  });

  it('retries a transient failure up to maxAttempts', async () => {
    let calls = 0;
    const result = await runWithRetry(
      async () => {
        calls += 1;
        return err(fail('service_unavailable'));
      },
      { policy, sleep: noSleep },
    );
    assert.equal(calls, 3);
    assert.equal(result.ok, false);
    assert.equal(!result.ok && result.error.code, 'service_unavailable');
  });

  it('stops as soon as an attempt succeeds', async () => {
    let calls = 0;
    const result = await runWithRetry(
      async () => {
        calls += 1;
        return calls < 2 ? err(fail('timeout')) : ok('done');
      },
      { policy, sleep: noSleep },
    );
    assert.equal(calls, 2);
    assert.equal(result.ok && result.value, 'done');
  });

  it('does not retry a non-transient failure', async () => {
    let calls = 0;
    const result = await runWithRetry(
      async () => {
        calls += 1;
        return err(fail('unsupported_language'));
      },
      { policy, sleep: noSleep },
    );
    assert.equal(calls, 1, 'should not retry');
    assert.equal(!result.ok && result.error.code, 'unsupported_language');
  });

  it('honours maxAttempts of 1 as "no retries"', async () => {
    let calls = 0;
    await runWithRetry(
      async () => {
        calls += 1;
        return err(fail('timeout'));
      },
      { policy: { ...policy, maxAttempts: 1 }, sleep: noSleep },
    );
    assert.equal(calls, 1);
  });
});

describe('fetch http client', () => {
  const client = (fetchImpl: typeof fetch) =>
    createFetchHttpClient({ defaultTimeoutMs: 50, fetchImpl });

  it('returns a parsed body for a successful response', async () => {
    const http = client(
      (async () =>
        new Response(JSON.stringify({ translatedText: 'Hallo' }), { status: 200 })) as typeof fetch,
    );

    const result = await http.send({ url: 'https://example.test/translation', method: 'POST' });
    assert.equal(result.ok, true);
    assert.deepEqual(result.ok && result.value.data, { translatedText: 'Hallo' });
    assert.equal(result.ok && result.value.ok, true);
  });

  it('reports a completed non-2xx exchange as ok with its status', async () => {
    const http = client((async () => new Response('{}', { status: 503 })) as typeof fetch);
    const result = await http.send({ url: 'https://example.test', method: 'GET' });
    assert.equal(result.ok, true, 'transport succeeded');
    assert.equal(result.ok && result.value.ok, false);
    assert.equal(result.ok && result.value.status, 503);
  });

  it('turns a connection failure into network_unavailable', async () => {
    const http = client((async () => {
      throw new TypeError('Network request failed');
    }) as typeof fetch);

    const result = await http.send({ url: 'https://example.test', method: 'GET' });
    assert.equal(!result.ok && result.error.code, 'network_unavailable');
  });

  it('times out a request that never answers', async () => {
    const http = client(
      ((_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })) as unknown as typeof fetch,
    );

    const started = Date.now();
    const result = await http.send({ url: 'https://example.test', method: 'GET', timeoutMs: 30 });
    assert.equal(!result.ok && result.error.code, 'timeout');
    assert.ok(Date.now() - started < 1000, 'should not hang');
  });

  it('survives a body that is not JSON', async () => {
    const http = client(
      (async () => new Response('<html>oops</html>', { status: 200 })) as typeof fetch,
    );
    const result = await http.send({ url: 'https://example.test', method: 'GET' });
    assert.equal(result.ok, true);
    assert.equal(result.ok && result.value.data, undefined);
  });
});
