import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The translator home screen: its header controls and its shortcuts.
 *
 * React Native will not render under Node, so these are structural. What they
 * pin is the property that matters for this screen — every control goes
 * somewhere that exists, and nothing here is gated on a plan.
 *
 * Split out of `onboarding.test.ts`, where these blocks first landed because
 * the two screens were built in the same sitting. They describe different
 * work and now live apart.
 */

const read = (path: string) => readFileSync(path, 'utf8');

/** Source with block comments and comment-only lines removed. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const TRANSLATE = 'src/features/translation/screens/translate-screen.tsx';
const ACTIONS = 'src/features/translation/components/home-actions.tsx';
const TILES = 'src/features/translation/components/feature-tiles.tsx';

describe('the home screen header', () => {
  it('leads to the upgrade screen and to settings, both of which exist', () => {
    const actions = code(ACTIONS);
    const screen = code(TRANSLATE);

    assert.match(screen, /onOpenUpgrade=\{\(\) => router\.push\('\/upgrade'\)\}/);
    assert.match(screen, /onOpenSettings=\{\(\) => router\.push\('\/settings'\)\}/);

    assert.ok(existsSync('app/upgrade.tsx'));
    assert.ok(existsSync('app/(tabs)/settings.tsx'));

    assert.match(actions, /accessibilityLabel="Transee Pro"/);
  });

  it('invents no help button, because there is no help screen', () => {
    const actions = code(ACTIONS).toLowerCase();

    assert.equal(actions.includes('help'), false);
    assert.equal(existsSync('app/help.tsx'), false);
  });

  it('claims nothing about the user being Pro', () => {
    // The control opens a screen. It does not read, set or display a plan,
    // and it is not a toggle.
    const actions = code(ACTIONS);

    assert.equal(actions.includes('setPlan'), false);
    assert.equal(actions.includes('useEntitlements'), false);
    assert.equal(/plan === /.test(actions), false);
  });
});

describe('the feature shortcuts', () => {
  it('goes only to routes that exist', () => {
    const screen = code(TRANSLATE);
    const routes: [string, string][] = [
      ["router.push('/camera')", 'app/(tabs)/camera.tsx'],
      ["router.push('/settings/language-packs')", 'app/settings/language-packs.tsx'],
      ["router.push('/history')", 'app/(tabs)/history.tsx'],
    ];

    for (const [call, file] of routes) {
      assert.ok(screen.includes(call), `missing ${call}`);
      assert.ok(existsSync(file), `${call} has no route file`);
    }
  });

  it('invents neither Phrases nor Quotation', () => {
    // Both appear in the reference design. Neither feature exists here, and a
    // tile that opens nothing teaches a user not to trust the others.
    const screen = code(TRANSLATE).toLowerCase();

    for (const word of ['phrase', 'quotation']) {
      assert.equal(screen.includes(word), false, word);
    }
  });

  it('drops the voice shortcut when the device cannot listen', () => {
    // The same rule the composer's own microphone follows: an action that
    // cannot work is not shown, rather than shown failing.
    assert.match(code(TRANSLATE), /speech\.status === 'unavailable'\s*\?\s*\[\]/);
  });

  it('gates no shortcut on a plan', () => {
    const screen = code(TRANSLATE);
    const tiles = code(TILES);

    // Every one of these is part of the free app.
    // The array literal alone. Slicing as far as `<FeatureTiles` would take
    // in the header in between, whose Pro control legitimately says upgrade.
    const start = screen.indexOf('const tiles');
    const shortcuts = screen.slice(start, screen.lastIndexOf('];', screen.indexOf('return (')));

    // Proof the slice actually covers the array, so the absence checks below
    // are about the shortcuts rather than about an empty string.
    assert.ok(shortcuts.includes("key: 'camera'"), 'the shortcut slice missed the array');
    for (const token of ['locked', 'entitle', 'upgrade', "has('"]) {
      assert.equal(shortcuts.toLowerCase().includes(token.toLowerCase()), false, token);
    }

    assert.equal(tiles.includes('useEntitlements'), false);
  });

  it('sits below the translating controls, not on top of them', () => {
    /*
     * Layout order, asserted because it is the thing a future ad placement
     * will be tempted to break. The composer, the result and the Translate
     * button all come before the shortcuts, so nothing added down here can
     * push a translation off the screen.
     */
    const screen = code(TRANSLATE);

    assert.ok(screen.indexOf('<TranslationComposer') < screen.indexOf('<FeatureTiles'));
    assert.ok(screen.indexOf('<TranslationResultCard') < screen.indexOf('<FeatureTiles'));
    assert.ok(screen.indexOf('label="Translate"') < screen.indexOf('<FeatureTiles'));
  });
});
