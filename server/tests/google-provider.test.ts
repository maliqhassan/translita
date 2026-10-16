import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadConfig } from '../src/config';
import {
  adaptGoogleResponse,
  adaptGoogleStatus,
  createGoogleProvider,
  fromGoogleCode,
  toGoogleCode,
} from '../src/translation/google-provider';

/**
 * Google Cloud Translation, behind the same interface as Azure: chosen with
 * TRANSLATION_PROVIDER=google, speaking Google's codes outward and the shared
 * map's codes back, and never letting the key out.
 */

const SECRET = 'AIza-THIS-MUST-NEVER-APPEAR-IN-A-RESPONSE';

describe('the Google translation provider', () => {
  it('is chosen by TRANSLATION_PROVIDER=google, with its own key', () => {
    const config = loadConfig({ TRANSLATION_PROVIDER: 'google', GOOGLE_TRANSLATE_API_KEY: SECRET });
    assert.equal(config.provider, 'google');
    assert.equal(config.googleApiKey, SECRET);
    assert.equal(loadConfig({}).provider, 'azure');
  });

  it("speaks Google's codes where they differ, both ways", () => {
    assert.equal(toGoogleCode('zh-Hans'), 'zh-CN');
    assert.equal(toGoogleCode('zh-Hant'), 'zh-TW');
    assert.equal(toGoogleCode('fil'), 'tl');
    assert.equal(toGoogleCode('nb'), 'no');
    assert.equal(toGoogleCode('de'), 'de');
    assert.equal(fromGoogleCode('zh-CN'), 'zh-Hans');
    assert.equal(fromGoogleCode('iw'), 'he');
    assert.equal(fromGoogleCode('fr'), 'fr');
  });

  it('sends the text to Google, and reads the translation back', async () => {
    let url = '';
    let body: Record<string, unknown> = {};
    const provider = createGoogleProvider({
      apiKey: SECRET,
      timeoutMs: 5000,
      fetchImpl: (async (input: string, init: RequestInit) => {
        url = input;
        body = JSON.parse(String(init.body)) as Record<string, unknown>;
        return new Response(
          JSON.stringify({
            data: {
              translations: [{ translatedText: 'Guten Morgen', detectedSourceLanguage: 'en' }],
            },
          }),
        );
      }) as typeof fetch,
    });
    const result = await provider.translate({ text: 'Good morning', targetCode: 'zh-Hans' });
    assert.ok(url.startsWith('https://translation.googleapis.com/language/translate/v2'));
    assert.equal(body.target, 'zh-CN');
    assert.equal(body.source, undefined, 'no source asks Google to detect it');
    assert.equal(body.format, 'text');
    assert.deepEqual(result, {
      ok: true,
      value: { translatedText: 'Guten Morgen', detectedCode: 'en' },
    });
  });

  it('maps failures, and never lets the key out', async () => {
    assert.equal(adaptGoogleStatus(403).ok, false);
    const failing = createGoogleProvider({
      apiKey: SECRET,
      timeoutMs: 5000,
      fetchImpl: (async () => {
        throw new Error(`network down for https://x?key=${SECRET}`);
      }) as typeof fetch,
    });
    const result = await failing.translate({ text: 'Hi', targetCode: 'de' });
    assert.equal(result.ok, false);
    assert.equal(JSON.stringify(result).includes(SECRET), false);
    assert.equal(adaptGoogleResponse({ data: { translations: [] } }).ok, false);
  });
});
