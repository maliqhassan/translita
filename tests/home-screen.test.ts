import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ADMOB } from '@/constants';

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
const BANNER = 'src/features/ads/components/banner-ad.tsx';
const TABS_LAYOUT = 'app/(tabs)/_layout.tsx';

describe('the home screen header', () => {
  it('leads to the upgrade screen and to settings, both of which exist', () => {
    const actions = code(ACTIONS);
    const screen = code(TRANSLATE);

    assert.match(screen, /onOpenUpgrade=\{\(\) => router\.push\('\/upgrade'\)\}/);
    assert.match(screen, /onOpenSettings=\{\(\) => router\.push\('\/settings'\)\}/);

    assert.ok(existsSync('app/upgrade.tsx'));
    assert.ok(existsSync('app/(tabs)/settings.tsx'));

    assert.match(actions, /accessibilityLabel=\{t\('Translita Pro'\)\}/);
  });

  it('invents no help button, because there is no help screen', () => {
    const actions = code(ACTIONS).toLowerCase();

    assert.equal(actions.includes('help'), false);
    assert.equal(existsSync('app/help.tsx'), false);
  });

  it('puts the logo and title on one line, identical on every tab', () => {
    // Home used to draw its own header, with a status line under the name
    // that lifted it off the logo's line, and the row took the height of its
    // tallest control — so the logo sat at a different height on each tab.
    const header = code('src/components/layout/screen-header.tsx');
    assert.match(header, /minHeight: theme\.layout\.minTouchTarget/);
    assert.match(header, /variant=\{compact \? 'brandTitle' : 'h1'\}/);

    assert.match(
      code('src/features/translation/components/home-header.tsx'),
      /<ScreenHeader\s+compact/,
    );
    for (const screen of [
      'src/features/camera/screens/camera-screen.tsx',
      'src/features/history/screens/history-screen.tsx',
      'src/features/settings/screens/settings-screen.tsx',
    ]) {
      assert.match(
        code(screen),
        /<ScreenHeader\s+compact[\s\S]{0,80}leading=\{<BrandMark \/>\}/,
        screen,
      );
    }
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
    // History is its own tab, so it is not repeated here.
    const routes: [string, string][] = [
      ["router.push('/camera')", 'app/(tabs)/camera.tsx'],
      ["router.push('/conversation')", 'app/conversation.tsx'],
      ["router.push('/settings/language-packs')", 'app/settings/language-packs.tsx'],
    ];

    for (const [call, file] of routes) {
      assert.ok(screen.includes(call), `missing ${call}`);
      assert.ok(existsSync(file), `${call} has no route file`);
    }
  });

  it('opens AI Practice straight into the tutor, and never strands it', () => {
    // The card asks for Practice through the route. The Conversation screen
    // honours that, and falls back to a person when this build has no tutor,
    // rather than sitting in a mode with no way out.
    assert.match(
      code(TRANSLATE),
      /router\.push\(\{ pathname: '\/conversation', params: \{ mode: 'tutor' \} \}\)/,
    );

    const conversation = code('src/features/conversation/screens/conversation-screen.tsx');
    assert.match(conversation, /params\.mode === 'tutor' \? 'tutor' : 'person'/);
    assert.match(conversation, /if \(!available\) setMode\('person'\);/);
  });

  it('lists Phrases now that it exists, and still invents no Quotation', () => {
    // Phrases was left out while there was nothing behind it; it is a real
    // screen now. Quotation still does not exist, so it still has no tile.
    const screen = code(TRANSLATE);

    assert.ok(screen.includes("router.push('/phrases')"));
    assert.ok(existsSync('app/phrases.tsx'));
    assert.equal(screen.toLowerCase().includes('quotation'), false);
  });

  it('always lists Conversation, and lets that screen explain a missing recogniser', () => {
    // It used to vanish whenever speech read as unavailable — which is also
    // the answer for a moment at startup, and always in Expo Go — so the
    // feature looked missing. The row now always shows; the Conversation
    // screen says plainly when a device cannot listen.
    const screen = code(TRANSLATE);

    assert.match(screen, /key: 'conversation'/);
    assert.equal(/speech\.status === 'unavailable'\s*\?\s*\[\]/.test(screen), false);
    assert.match(
      code('src/features/conversation/screens/conversation-screen.tsx'),
      /no speech recogniser/,
    );
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
    assert.ok(screen.indexOf("label={t('Translate')}") < screen.indexOf('<FeatureTiles'));
  });
});

describe('before and after translating are one screen, not two', () => {
  it('adds no separate result route', () => {
    for (const path of ['app/result.tsx', 'app/translate/result.tsx', 'app/translation.tsx']) {
      assert.equal(existsSync(path), false, path);
    }
    assert.equal(code(TRANSLATE).includes("router.push('/result"), false);
  });

  it('keeps the shortcuts and recent list below, before and after translating', () => {
    const screen = code(TRANSLATE);

    // They used to vanish once a result appeared. Now nothing gates them on
    // the translation state.
    assert.equal(screen.includes('hasResult'), false, 'the shortcuts are gated on a result again');

    // Both below the Translate button, in one block that glides down when the
    // result card opens above it.
    const translate = screen.indexOf("label={t('Translate')}");
    const tiles = screen.indexOf('<FeatureTiles tiles={tiles} />');
    const recent = screen.indexOf('<RecentTranslations />');
    assert.ok(translate < tiles && tiles < recent, 'Translate, then shortcuts, then recent');

    const block = screen.slice(screen.lastIndexOf('<Animated.View', tiles), recent);
    assert.match(block, /layout=\{LinearTransition/);
  });

  it('reveals the result directly below the source box, above the Translate button', () => {
    const screen = code(TRANSLATE);

    assert.ok(screen.indexOf('<TranslationComposer') < screen.indexOf('<TranslationResultCard'));
    assert.ok(screen.indexOf('<TranslationResultCard') < screen.indexOf("label={t('Translate')}"));
  });

  it('draws nothing for the result before anything is translated', () => {
    assert.match(
      code('src/features/translation/components/translation-result-card.tsx'),
      /if \(state\.status === 'idle'\) return null;/,
    );
  });

  it('only claims the device is offline ready when the current pair is', () => {
    assert.match(code(TRANSLATE), /offlineReady=\{readiness\?\.kind === 'ready'\}/);
  });
});

describe('the AdMob spike banner', () => {
  /*
   * Structural only, and deliberately so.
   *
   * Nothing here can tell you whether an advert rendered: that needs the
   * native SDK, a device and a real request, none of which exist under Node.
   * What these do pin is the part that is decidable from the source — where
   * the banner sits, what it is gated on, and that it uses a test unit — so
   * the spike cannot quietly become a real placement.
   */

  it('lives in the tab bar slot, not inside any screen', () => {
    /*
     * The placement rule, and the reason it is stronger than the previous one.
     *
     * While the banner sat inside the home screen's scroll view, "it cannot
     * cover a translation" depended on the order of elements in that one
     * file. In the tab bar's slot it is outside every scroll view in the app,
     * so no amount of content can move it onto anything.
     */
    assert.match(code(TABS_LAYOUT), /<PlanBannerAd \/>/);
    assert.ok(
      code(TABS_LAYOUT).indexOf('<PlanBannerAd') < code(TABS_LAYOUT).indexOf('<AppTabBar'),
      'the banner must sit above the bar, not below it',
    );
  });

  it('is absent from the translator screen entirely', () => {
    const screen = code(TRANSLATE);

    assert.equal(screen.includes('BannerAd'), false, 'an advert leaked back into the screen');
    assert.equal(screen.includes('HomeBannerAd'), false);
  });

  it('is gated on the capability, never on the plan', () => {
    const banner = code(BANNER);

    assert.ok(banner.includes("has('adFree')"), 'the capability check is missing');
    assert.equal(/plan === /.test(banner), false, 'a plan comparison leaked in');
    assert.equal(banner.includes('revenuecat'), false);
    assert.equal(banner.toLowerCase().includes('purchases'), false);
  });

  it('renders nothing for someone who paid to remove ads', () => {
    // The single line the whole gate rests on.
    assert.ok(
      code(BANNER).includes("if (!loaded || has('adFree')) return null;"),
      'the early return is missing',
    );
  });

  it('asks the shared chooser for its unit, and writes none down itself', () => {
    const banner = code(BANNER);

    // Real in release, Google's test unit in development — decided in one
    // place for every format, never per component.
    assert.match(banner, /const unitId = unitFor\('banner'\);/);
    assert.match(banner, /unitId=\{unitId\}/);
    assert.equal(/ca-app-pub-/.test(banner), false);
  });

  it('keeps the ad out of the critical path', () => {
    const banner = code(BANNER);

    // A failed request is silent, and a throw is contained rather than
    // taking the app's main screen down with it.
    assert.ok(banner.includes('onAdFailedToLoad={() => {}}'), 'the failure path is missing');
    assert.ok(banner.includes('getDerivedStateFromError'), 'no error boundary');

    for (const forbidden of ['Alert', 'setPlan', 'update(']) {
      assert.equal(banner.includes(forbidden), false, forbidden);
    }
  });

  it('is confined to one file, so the spike is reversible', () => {
    // The whole integration is this component plus one line of the layout.
    const layout = code(TABS_LAYOUT);

    assert.equal((layout.match(/PlanBannerAd/g) ?? []).length, 2, 'import plus one usage');
    assert.equal(code(TILES).includes('BannerAd'), false);
  });

  it('declares the real AdMob application id in app.json, matching the config', () => {
    const app = JSON.parse(read('app.json')) as {
      expo: { plugins: (string | [string, Record<string, string>])[] };
    };

    const entry = app.expo.plugins.find(
      (plugin) => Array.isArray(plugin) && plugin[0] === 'react-native-google-mobile-ads',
    );

    assert.ok(Array.isArray(entry), 'the ads plugin is not configured');
    // The account's own app, not Google's sample: live units only fill for
    // the app they were created under.
    assert.equal(entry[1].androidAppId, ADMOB.appId);
    assert.equal(entry[1].androidAppId.includes('3940256099942544'), false, 'the sample app id');
    assert.equal('iosAppId' in entry[1], false, 'Android only');
  });
});
