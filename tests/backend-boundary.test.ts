import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { TRANSLATION_CONFIG, hasBackendConfigured } from '@/constants/translation-config';

/**
 * The line between the app and the provider.
 *
 * The app talks to the Translita backend and knows nothing else: not Azure's
 * host, not its headers, and above all not its key. Every `EXPO_PUBLIC_*`
 * value is inlined into the bundle at build time and is readable by anyone
 * holding the APK, so the only one allowed is the public backend URL.
 */

function appSources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) appSources(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

const SOURCES = [...appSources('src'), ...appSources('app'), ...appSources('modules')];

describe('the app never learns the provider credential', () => {
  it('contains no Azure authentication header anywhere', () => {
    for (const path of SOURCES) {
      const source = readFileSync(path, 'utf8');
      for (const header of ['Ocp-Apim-Subscription-Key', 'Ocp-Apim-Subscription-Region']) {
        assert.equal(source.includes(header), false, `${path} references ${header}`);
      }
    }
  });

  it('never calls the provider directly', () => {
    // The catalogue records where its data came from, which is a public,
    // keyless documentation URL. Calling the translate endpoint is the thing
    // that must not happen.
    for (const path of SOURCES) {
      const source = readFileSync(path, 'utf8');
      assert.equal(
        /cognitive\.microsofttranslator\.com\/translate/.test(source),
        false,
        `${path} calls the provider directly`,
      );
    }
  });

  it('reads only the public variables it is meant to', () => {
    const used = new Set<string>();

    for (const path of SOURCES) {
      for (const match of readFileSync(path, 'utf8').matchAll(/EXPO_PUBLIC_[A-Z0-9_]+/g)) {
        used.add(match[0]);
      }
    }

    /*
     * Two, and both are public by nature: the backend's own URL, and
     * RevenueCat's public SDK key, which identifies the app and authorises
     * nothing. Anything that grants access — the Azure credential, the model
     * credential, RevenueCat's secret key — lives on the server and must
     * never appear in this list.
     */
    assert.deepEqual([...used].sort(), [
      'EXPO_PUBLIC_REVENUECAT_KEY',
      'EXPO_PUBLIC_TRANSEE_API_URL',
    ]);
  });

  it('carries nothing credential-shaped in its translation configuration', () => {
    const serialised = JSON.stringify(TRANSLATION_CONFIG).toLowerCase();

    for (const forbidden of ['key', 'secret', 'token', 'password', 'authorization', 'azure']) {
      assert.equal(serialised.includes(forbidden), false, forbidden);
    }
  });
});

describe('the backend URL is the app’s only address for translation', () => {
  it('points at a Translita host, never a provider one, when set', () => {
    const url = TRANSLATION_CONFIG.backend.baseUrl;

    if (url !== undefined) {
      assert.equal(/cognitive|microsofttranslator|azure/i.test(url), false);
    }
  });

  it('appends the Translita path, matching the backend route', () => {
    assert.equal(TRANSLATION_CONFIG.backend.translatePath, '/translation');
  });

  it('treats an unset variable as no backend rather than a default one', () => {
    // A guessed fallback URL would send every user's text to whatever happens
    // to answer there.
    assert.equal(hasBackendConfigured(), TRANSLATION_CONFIG.backend.baseUrl !== undefined);
  });

  it('is documented for deployment without a real value in the repo', () => {
    const example = readFileSync('.env.example', 'utf8');

    assert.match(example, /EXPO_PUBLIC_TRANSEE_API_URL=\s*$/m, 'placeholder must stay empty');
    assert.match(example, /never/i, 'it must say the provider key does not belong here');
  });
});

describe('the backend keeps its own secret out of the repository', () => {
  it('ships an example file with empty placeholders only', () => {
    const example = readFileSync('server/.env.example', 'utf8');

    for (const key of [
      'TRANSLATION_PROVIDER_API_KEY',
      'TRANSLATION_PROVIDER_REGION',
      'TRANSLATION_PROVIDER_ENDPOINT',
    ]) {
      assert.match(example, new RegExp(`^${key}=\\s*$`, 'm'), `${key} must be present and empty`);
    }
  });

  it('ignores real env files', () => {
    const ignored = readFileSync('server/.gitignore', 'utf8');

    assert.match(ignored, /^\.env$/m);
    assert.match(ignored, /^!\.env\.example$/m);
  });
});

describe('build profiles carry configuration, never values', () => {
  const eas = () => JSON.parse(readFileSync('eas.json', 'utf8')) as Record<string, unknown>;

  const profiles = () => {
    const build = eas().build as Record<string, Record<string, unknown>>;
    return build;
  };

  it('names an environment for each profile, so EAS supplies the URL', () => {
    // The app reads the URL from the bundle, and only EAS can put it there for
    // a cloud build — a local .env never reaches an EAS worker.
    for (const name of ['preview', 'production']) {
      assert.equal(typeof profiles()[name]?.environment, 'string', `${name} names no environment`);
    }
  });

  it('keeps preview and production independently configurable', () => {
    // Otherwise a staging backend could be baked into a store build.
    assert.notEqual(profiles().preview?.environment, profiles().production?.environment);
  });

  it('contains no backend URL of any kind', () => {
    // The deployment address belongs to the EAS environment, not to git. A URL
    // committed here would also make every host change a repository change.
    const serialised = readFileSync('eas.json', 'utf8');

    assert.equal(/https?:\/\//.test(serialised), false, 'no URL may be committed here');
  });

  it('carries nothing credential-shaped', () => {
    // A build profile is the one place someone might reasonably think an
    // Azure key belongs. It does not: the key is the backend's alone.
    const serialised = readFileSync('eas.json', 'utf8').toLowerCase();

    for (const forbidden of [
      'key',
      'secret',
      'token',
      'password',
      'authorization',
      'azure',
      'cognitive',
      'subscription',
    ]) {
      assert.equal(serialised.includes(forbidden), false, forbidden);
    }
  });

  it('declares no inline env block, so no value can be committed by accident', () => {
    for (const name of ['preview', 'production']) {
      assert.equal(profiles()[name]?.env, undefined, `${name} must take values from EAS`);
    }
  });

  it('says in the README how the URL actually reaches a build', () => {
    const readme = readFileSync('README.md', 'utf8');

    assert.match(readme, /eas env:create/);
    assert.match(readme, /EXPO_PUBLIC_TRANSEE_API_URL/);
    // The trap worth documenting: a secret-typed variable is withheld from the
    // bundler, producing a build with no backend and no error.
    assert.match(readme, /plaintext/i);
  });
});
