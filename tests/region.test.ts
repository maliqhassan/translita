import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { countryLanguage, regionOf } from '@/constants';
import { starterPair } from '@/features/onboarding/starter-pair';

/**
 * The phone's country, from its region setting, and what it decides: the pair
 * a new user starts on, and the one offline pack offered on Home.
 */

const code = (path: string) =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

describe('the country from the region setting', () => {
  it('reads the country part of a locale, and nothing else', () => {
    assert.equal(regionOf('en-PH'), 'PH');
    assert.equal(regionOf('fil-PH'), 'PH');
    assert.equal(regionOf('de-DE'), 'DE');
    assert.equal(regionOf('zh-Hant-TW'), 'TW');
    assert.equal(regionOf('en_us'), 'US');
    assert.equal(regionOf('en'), undefined);
    assert.equal(regionOf('es-419'), undefined, 'a region number is not a country');
    assert.equal(regionOf(''), undefined);
  });

  it('maps a country to its one language, and guesses nothing for the rest', () => {
    assert.equal(countryLanguage('PH'), 'fil');
    assert.equal(countryLanguage('ph'), 'fil');
    assert.equal(countryLanguage('DE'), 'de');
    assert.equal(countryLanguage('ID'), 'id');
    assert.equal(countryLanguage('BR'), 'pt-BR');
    for (const mixed of ['CH', 'CA', 'BE', 'US', 'GB']) {
      assert.equal(countryLanguage(mixed), undefined, mixed);
    }
    assert.equal(countryLanguage(undefined), undefined);
  });
});

describe('the pair a new user starts on', () => {
  it('starts English speakers on their country’s language', () => {
    assert.deepEqual(starterPair('en', 'PH'), { source: 'en', target: 'fil' });
    assert.deepEqual(starterPair('en', 'DE'), { source: 'en', target: 'de' });
    // No country, or one with no single language: the default pair stands.
    assert.equal(starterPair('en', undefined), undefined);
    assert.equal(starterPair('en', 'CH'), undefined);
  });

  it('keeps everyone else on their own language into English', () => {
    assert.deepEqual(starterPair('ur', 'PK'), { source: 'ur', target: 'en' });
    assert.deepEqual(starterPair('fil', 'PH'), { source: 'fil', target: 'en' });
  });
});

describe('the country pack offer', () => {
  const offer = code('src/features/offline/components/country-pack-offer.tsx');

  it('downloads only from the Download button, never on its own', () => {
    // One call site, inside the button's handler.
    assert.equal(offer.match(/download\(pack\.modelId\)/g)?.length, 1);
    assert.match(
      offer,
      /const pressDownload = \(\) => \{[\s\S]*?for \(const pack of missing\) download\(pack\.modelId\);/,
    );
    assert.equal(/useEffect/.test(offer), false, 'no effect that could start a download');
  });

  it('asks for no location permission', () => {
    assert.equal(/expo-location|Location\./.test(offer), false);
    assert.match(
      code('src/constants/regions.ts'),
      /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.locale/,
    );
  });

  it('sits on Home', () => {
    assert.match(
      code('src/features/translation/screens/translate-screen.tsx'),
      /<CountryPackOffer \/>/,
    );
  });
});
