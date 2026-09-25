import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { TRANSLATION_CONFIG } from '@/constants';
import type { HttpClient, HttpRequest } from '@/services/http';
import { createBackendTutorService } from '@/services/tutor';
import { ok } from '@/utils';

/**
 * Language practice, from the app's side.
 *
 * The one thing that genuinely matters here is the absence of a credential.
 * An OpenAI key bills without a cap, so a key in this bundle is not a quota
 * problem like the translation one — it is somebody's invoice. Most of what
 * follows checks it is not here and cannot get here.
 */

const read = (path: string) => readFileSync(path, 'utf8');

const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

/** Every `.ts`/`.tsx` under a directory. */
function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/** Records what was sent and answers with whatever the test needs. */
function fakeHttp(status: number, data: unknown): HttpClient & { sent?: HttpRequest } {
  const client: HttpClient & { sent?: HttpRequest } = {
    async send(request) {
      client.sent = request;
      return ok({ status, ok: status >= 200 && status < 300, data });
    },
  };
  return client;
}

const ask = { learning: 'es', native: 'en', heard: 'hola', history: [] } as const;

describe('no model credential is anywhere in this app', () => {
  it('holds no OpenAI key, in any form', () => {
    for (const dir of ['src', 'app']) {
      for (const path of sources(dir)) {
        const source = read(path);

        assert.equal(/sk-[A-Za-z0-9_-]{16,}/.test(source), false, `a key literal in ${path}`);
        assert.equal(source.includes('OPENAI_API_KEY'), false, `a key name in ${path}`);
        assert.equal(
          source.includes('api.openai.com'),
          false,
          `${path} calls the model directly, bypassing the server`,
        );
      }
    }
  });

  it('declares no public variable that could carry one', () => {
    // `EXPO_PUBLIC_*` is inlined into the bundle at build time, so a key put
    // there is a key published.
    const config = read('src/constants/translation-config.ts');
    const matches = config.match(/EXPO_PUBLIC_[A-Z_]+/g) ?? [];

    assert.deepEqual([...new Set(matches)], ['EXPO_PUBLIC_TRANSEE_API_URL']);
  });

  it('reaches the model only through our own backend', () => {
    assert.equal(TRANSLATION_CONFIG.backend.tutorPath, '/tutor');
    assert.match(code('src/services/tutor/tutor-service.ts'), /options\.http\.send\(/);
  });
});

describe('the tutor service', () => {
  it('posts the ask to the configured backend', async () => {
    const http = fakeHttp(200, { kind: 'reply', reply: 'hola', gloss: 'hi', followUp: '¿y tú?' });
    const service = createBackendTutorService({
      baseUrl: 'https://api.test',
      path: '/tutor',
      http,
    });

    const result = await service.respond(ask);

    assert.equal(result.ok, true);
    assert.equal(http.sent?.url, 'https://api.test/tutor');
    assert.equal(http.sent?.method, 'POST');
  });

  it('reports itself unavailable in a build with no backend', async () => {
    const http = fakeHttp(200, {});
    const service = createBackendTutorService({ baseUrl: undefined, path: '/tutor', http });

    assert.equal(await service.isAvailable(), false);
    // And refuses rather than calling a URL that is not there.
    assert.equal((await service.respond(ask)).ok, false);
    assert.equal(http.sent, undefined);
  });

  it('caps the thread it uploads', async () => {
    const http = fakeHttp(200, { kind: 'reply', reply: 'a', gloss: 'b', followUp: 'c' });
    const service = createBackendTutorService({
      baseUrl: 'https://api.test',
      path: '/tutor',
      http,
    });

    const history = Array.from({ length: 30 }, (_, i) => ({
      role: 'learner' as const,
      text: `turn ${i}`,
    }));
    await service.respond({ ...ask, history });

    const body = http.sent?.body as { history: unknown[] };
    assert.ok(body.history.length <= 8, 'a long conversation must not be re-uploaded in full');
  });

  it('reads both halves of the exchange bilingually, not just the reply', async () => {
    const http = fakeHttp(200, {
      kind: 'reply',
      heardGloss: 'How are you',
      reply: 'hola',
      gloss: 'hi',
      followUp: '¿y tú?',
      followUpGloss: 'And you?',
    });
    const service = createBackendTutorService({
      baseUrl: 'https://api.test',
      path: '/tutor',
      http,
    });

    const result = await service.respond(ask);

    assert.ok(result.ok && result.value.kind === 'reply');
    assert.equal(
      result.ok && result.value.kind === 'reply' && result.value.heardGloss,
      'How are you',
    );
    assert.equal(
      result.ok && result.value.kind === 'reply' && result.value.followUpGloss,
      'And you?',
    );
  });

  it('reads back all three shapes the server can answer with', async () => {
    const cases: [unknown, string][] = [
      [{ kind: 'reply', reply: 'hola', gloss: 'hi', followUp: '¿y tú?' }, 'reply'],
      [{ kind: 'clarify', options: ['¿Cómo estás?', '¿Cómo está?'] }, 'clarify'],
      [{ kind: 'declined', message: 'Back to practising.' }, 'declined'],
    ];

    for (const [data, kind] of cases) {
      const service = createBackendTutorService({
        baseUrl: 'https://api.test',
        path: '/tutor',
        http: fakeHttp(200, data),
      });
      const result = await service.respond(ask);

      assert.equal(result.ok && result.value.kind, kind);
    }
  });

  it('refuses a shape it does not recognise rather than showing it', async () => {
    for (const data of [null, {}, { kind: 'reply' }, { kind: 'clarify', options: ['only one'] }]) {
      const service = createBackendTutorService({
        baseUrl: 'https://api.test',
        path: '/tutor',
        http: fakeHttp(200, data),
      });

      assert.equal((await service.respond(ask)).ok, false, JSON.stringify(data));
    }
  });

  it('names the rate limit, because waiting is actionable', async () => {
    const service = createBackendTutorService({
      baseUrl: 'https://api.test',
      path: '/tutor',
      http: fakeHttp(429, {}),
    });

    const result = await service.respond(ask);
    assert.equal(!result.ok && result.error.code, 'rate_limited');
  });
});

describe('practice is sold, with a taste given away', () => {
  it('is a capability of its own, held only by Pro', () => {
    const capabilities = read('src/services/entitlements/plan-capabilities.ts');

    assert.match(capabilities, /'adFree', 'aiTutor'/);
    // And not in the free list, which is what makes it sellable.
    assert.equal(/FREE_CAPABILITIES = \[[^\]]*aiTutor/.test(capabilities), false);
  });

  it('asks the capability, never the plan', () => {
    const access = code('src/features/conversation/hooks/use-ai-access.ts');

    assert.match(access, /has\('aiTutor'\)/);
    assert.equal(/plan === /.test(access), false);
  });

  it('keeps the whole allowance rule in one hook', () => {
    // Three callers have to agree — the toggle, the microphone and the line
    // that explains the limit — and three copies would eventually disagree.
    const screen = code('src/features/conversation/screens/conversation-screen.tsx');

    assert.match(screen, /useAiAccess\(\)/);
    assert.equal(screen.includes('AI_TRIAL_TURNS'), false, 'the limit leaked into the screen');
  });

  it('checks the allowance before opening the microphone', () => {
    // Letting somebody speak and then refusing to answer wastes their
    // sentence, which is worse than refusing up front.
    assert.match(
      code('src/features/conversation/screens/conversation-screen.tsx'),
      /if \(mode === 'tutor' && !conversation\.listening && !ai\.allowed\)/,
    );
  });

  it('spends the allowance only on a turn that was actually heard', () => {
    assert.match(
      code('src/features/conversation/screens/conversation-screen.tsx'),
      /if \(mode === 'tutor' && transcript\.trim\(\)\) ai\.spend\(\)/,
    );
  });

  it('never counts a subscriber against an allowance they do not have', () => {
    // Counting them would leave the number climbing, and the day a plan
    // lapsed they would find the allowance already spent by their own
    // subscription.
    assert.match(
      code('src/features/conversation/hooks/use-ai-access.ts'),
      /if \(unlimited\) return;/,
    );
  });

  it('is honest that the allowance is per install, not per person', () => {
    // There is no sign-in, so there is no person to count. The comment is the
    // deliverable here: nothing downstream should treat this as a quota.
    assert.match(read('src/types/preferences.ts'), /reinstalling resets it/i);
  });
});
