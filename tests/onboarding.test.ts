import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { LANGUAGES, LEGAL } from '@/constants';
import { ONBOARDING_SLIDES } from '@/features/onboarding/onboarding-slides';
import {
  DEFAULT_PREFERENCES,
  PREFERENCES_VERSION,
  createPreferencesService,
  parsePreferences,
  serializePreferences,
} from '@/services/preferences';
import type { PreferencesStorage } from '@/services/preferences';
import { ok } from '@/utils';

/**
 * First launch, and the welcome screen that owns it.
 *
 * React Native will not render under Node, so the screen itself is pinned
 * structurally — what it navigates to, what it refuses to invent, and that it
 * styles itself through the theme. The part that is real logic, and the part
 * that can actually hurt someone, is the persistence: getting the migration
 * wrong shows the welcome screen to every existing user. That is unit-tested
 * against the real parser.
 */

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Advertising dependencies that have been approved, by exact name.
 *
 * Exact equality, never a pattern: `react-native-google-mobile-ads-mediation`
 * or any other SDK that happens to contain "ads" is a different package and
 * must still fail this. The list is one line and named so that widening it is
 * a visible decision rather than a loosened regex.
 */
const APPROVED_ADVERTISING: readonly string[] = ['react-native-google-mobile-ads'];

/**
 * The one billing dependency that has been approved, by exact name.
 *
 * Same rule as advertising: exact equality, so a differently-named purchase
 * or billing library still fails. RevenueCat is the agreed provider and this
 * is its SDK.
 */
const APPROVED_BILLING: readonly string[] = ['react-native-purchases'];

/** Source with block comments and comment-only lines removed. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const LAYOUT = 'app/_layout.tsx';
const WELCOME = 'src/features/onboarding/screens/welcome-screen.tsx';
const FLOW = 'src/features/onboarding/screens/onboarding-flow.tsx';
const CAROUSEL = 'src/features/onboarding/screens/onboarding-carousel.tsx';
const SLIDE_ART = 'src/features/onboarding/components/slide-illustration.tsx';
const ILLUSTRATION = 'src/features/onboarding/components/welcome-illustration.tsx';
const TRANSLATE = 'src/features/translation/screens/translate-screen.tsx';
const ACTIONS = 'src/features/translation/components/home-actions.tsx';
const TILES = 'src/features/translation/components/feature-tiles.tsx';

function memoryStorage(initial: string | null = null): PreferencesStorage {
  let slot = initial;
  return {
    async read() {
      return ok(slot);
    },
    async write(contents: string) {
      slot = contents;
      return ok(undefined);
    },
    async remove() {
      slot = null;
      return ok(undefined);
    },
  };
}

describe('a first launch is shown the welcome screen', () => {
  it('defaults to not having completed onboarding', () => {
    assert.equal(DEFAULT_PREFERENCES.onboardingComplete, false);
  });

  it('treats an install with nothing stored as new', async () => {
    // Nothing writes preferences on load, so "no file" really does mean the
    // app has never been used rather than merely never been launched.
    const loaded = await createPreferencesService(memoryStorage()).load();

    assert.equal(loaded.onboardingComplete, false);
  });

  it('treats unreadable or corrupt storage as new rather than crashing', async () => {
    for (const corrupt of ['{ truncated', 'null', '[]', '42']) {
      const loaded = await createPreferencesService(memoryStorage(corrupt)).load();
      assert.equal(loaded.onboardingComplete, false, corrupt);
    }
  });
});

describe('an existing install is never sent back through onboarding', () => {
  /** What a version-1 file looked like, before the field existed. */
  const version1 = JSON.stringify({
    version: 1,
    sourceLanguage: 'fr',
    targetLanguage: 'ja',
    translationMode: 'online',
    theme: 'dark',
    saveHistory: false,
    speechRate: 1.25,
  });

  it('migrates a stored file that predates the field', () => {
    /*
     * The assertion this whole migration exists for.
     *
     * Reading a missing field as its default would be right for every other
     * preference and wrong for this one: the file is proof the app has been
     * used, so its owner has already been past a welcome screen — or would be
     * seeing one for the first time having already chosen their languages.
     */
    assert.equal(parsePreferences(JSON.parse(version1) as unknown).onboardingComplete, true);
  });

  it('keeps every other preference through that migration', () => {
    // A migration that fixed onboarding and lost the user's languages would
    // be a far worse bug than the one it fixed.
    const migrated = parsePreferences(JSON.parse(version1) as unknown);

    assert.equal(migrated.sourceLanguage, 'fr');
    assert.equal(migrated.targetLanguage, 'ja');
    assert.equal(migrated.translationMode, 'online');
    assert.equal(migrated.theme, 'dark');
    assert.equal(migrated.saveHistory, false);
    assert.equal(migrated.speechRate, 1.25);
  });

  it('lets a stored value win over the migration default', () => {
    const stored = JSON.stringify({ version: 1, onboardingComplete: false });

    assert.equal(parsePreferences(JSON.parse(stored) as unknown).onboardingComplete, false);
  });

  it('bumped the version, which is what makes the migration run', () => {
    assert.ok(PREFERENCES_VERSION >= 2);
  });
});

describe('completing onboarding sticks', () => {
  it('survives a save and a load by a new service', async () => {
    const storage = memoryStorage();

    await createPreferencesService(storage).save({
      ...DEFAULT_PREFERENCES,
      onboardingComplete: true,
    });

    // A second service over the same storage is what a relaunch looks like.
    const relaunched = await createPreferencesService(storage).load();
    assert.equal(relaunched.onboardingComplete, true);
  });

  it('is written as a plain boolean, like every other preference', () => {
    const stored = JSON.parse(
      serializePreferences({ ...DEFAULT_PREFERENCES, onboardingComplete: true }),
    ) as Record<string, unknown>;

    assert.equal(stored.onboardingComplete, true);
    assert.equal(stored.version, PREFERENCES_VERSION);
  });

  it('introduced no second storage mechanism', () => {
    // It rides on the preferences file rather than a parallel flag, so there
    // is still exactly one thing to clear and one thing to migrate.
    const source = code('src/services/preferences/preferences-schema.ts');

    assert.match(source, /onboardingComplete/);
    assert.equal(existsSync('src/services/onboarding'), false);
  });
});

describe('the welcome screen', () => {
  it('replaces the navigator rather than adding a second translator', () => {
    const layout = code(LAYOUT);

    assert.match(layout, /if \(!preferences\.onboardingComplete\)/);
    assert.match(layout, /<OnboardingFlow/);

    // No route of its own: nothing to deep-link into, and no entry the system
    // back button could return to after getting started.
    assert.equal(existsSync('app/welcome.tsx'), false);
  });

  it('is what marks onboarding complete, once the flow says it is done', () => {
    // Get Started no longer finishes onboarding — it opens the carousel. The
    // preference is written when the flow completes, which is Skip or Start
    // Translating and nothing else.
    assert.match(code(LAYOUT), /onComplete=\{\(\) => update\(\{ onboardingComplete: true \}\)\}/);
    assert.match(code(FLOW), /onGetStarted=\{\(\) => setStarted\(true\)\}/);
  });

  it('resets nothing on the way through', () => {
    // Getting started updates one field. A `reset()` here would wipe the
    // languages of anyone the migration did not catch.
    const layout = code(LAYOUT);

    assert.equal(/reset\(\)/.test(layout), false);
    for (const path of [WELCOME, FLOW, CAROUSEL]) {
      assert.equal(code(path).includes('reset'), false, path);
    }
  });

  it('offers no sign-in, social login or account creation', () => {
    const screen = code(WELCOME).toLowerCase();

    for (const word of ['sign in', 'signin', 'sign up', 'google', 'facebook', 'apple', 'account']) {
      assert.equal(screen.includes(word), false, word);
    }
  });

  it('pays both safe areas, so it clears the status and navigation bars', () => {
    assert.match(code(WELCOME), /edges=\{\['top', 'bottom', 'left', 'right'\]\}/);
  });

  it('styles itself through the theme, with no literal colours', () => {
    // No literal colour anywhere in onboarding, including the file that only
    // composes the other two.
    for (const path of [WELCOME, ILLUSTRATION, FLOW, CAROUSEL, SLIDE_ART]) {
      const source = code(path);

      assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(source), false, `literal colour in ${path}`);
      assert.equal(/rgba?\(/.test(source), false, `literal colour in ${path}`);
    }

    // The theme is read by everything that actually draws. `FLOW` is left out
    // deliberately: it renders one of two screens and styles nothing itself,
    // so requiring a theme read there would only invite a pointless one.
    for (const path of [WELCOME, ILLUSTRATION, CAROUSEL, SLIDE_ART]) {
      assert.match(code(path), /useTheme\(\)/, path);
    }

    assert.equal(code(FLOW).includes('style'), false, 'the flow should not style anything');
  });

  it('adds no image or vector dependency for its artwork', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };

    // Named rather than pattern-matched: `react-native-reanimated` is a
    // long-standing dependency and contains "animat", so a loose pattern
    // fails on something that was already here.
    for (const name of ['react-native-svg', 'lottie-react-native', 'react-native-fast-image']) {
      assert.equal(name in pkg.dependencies, false, name);
    }

    // Drawn from views, not loaded from a file.
    for (const path of [ILLUSTRATION, SLIDE_ART]) {
      assert.equal(code(path).includes('require('), false, path);
      assert.equal(code(path).includes('<Image'), false, path);
    }
  });
});

describe('the privacy policy link', () => {
  it('points at a policy that is actually published', () => {
    /*
     * This asserted an empty string for the whole period nothing was
     * published, because a plausible-looking URL that 404s on a store listing
     * is worse than an honest blank. The documents are live now, so the
     * assertion becomes: a real one, over HTTPS.
     */
    assert.match(LEGAL.privacyPolicyUrl, /^https:\/\/\S+$/);
    assert.equal(LEGAL.privacyPolicyUrl.includes('example.com'), false);
  });

  it('carries the other two URLs the store asks for', () => {
    // Play wants privacy, terms and a data-deletion route. Keeping them
    // together means there is one place for them to go stale rather than
    // three.
    for (const url of [LEGAL.termsUrl, LEGAL.dataDeletionUrl]) {
      assert.match(url, /^https:\/\/\S+$/);
    }

    // Three distinct documents, not the same link three times.
    const urls = [LEGAL.privacyPolicyUrl, LEGAL.termsUrl, LEGAL.dataDeletionUrl];
    assert.equal(new Set(urls).size, 3);
  });

  it('is declared in one isolated place', () => {
    const config = read('src/constants/config.ts');

    assert.match(config, /privacyPolicyUrl: 'https:/);

    // The whole point of the constant: the screen reads it rather than
    // writing a URL of its own.
    const screen = code(WELCOME);
    assert.match(screen, /LEGAL\.privacyPolicyUrl/);
    assert.equal(/https:\/\/\S*privacy/i.test(screen), false, 'a URL literal reached the screen');
  });

  it('never silently does nothing', () => {
    const screen = code(WELCOME);

    // Either it opens the URL, or it says why it cannot. Both branches are
    // present, and the empty case is handled first.
    assert.match(screen, /if \(!LEGAL\.privacyPolicyUrl\)/);
    assert.match(screen, /setPolicyNote\(/);
    assert.match(screen, /Linking\.openURL\(LEGAL\.privacyPolicyUrl\)/);
  });

  it('opens it through the linking module the project already has', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };

    assert.ok(pkg.dependencies['expo-linking']);
    assert.match(code(WELCOME), /from 'expo-linking'/);
  });
});

describe('the onboarding carousel', () => {
  it('has five slides, each with a heading and a sentence', () => {
    assert.equal(ONBOARDING_SLIDES.length, 5);

    for (const slide of ONBOARDING_SLIDES) {
      assert.ok(slide.heading.length > 0, slide.key);
      assert.ok(slide.body.length > 0, slide.key);
      assert.ok(slide.icon.length > 0, slide.key);
    }
  });

  it('gives every slide a distinct key and picture', () => {
    const keys = ONBOARDING_SLIDES.map((slide) => slide.key);
    const icons = ONBOARDING_SLIDES.map((slide) => slide.icon);

    assert.equal(new Set(keys).size, keys.length, 'duplicate slide key');
    assert.equal(new Set(icons).size, icons.length, 'two slides share a picture');
  });

  it('follows the welcome screen rather than replacing it', () => {
    const flow = code(FLOW);

    assert.match(flow, /<WelcomeScreen/);
    assert.match(flow, /<OnboardingCarousel/);
    // Welcome first, carousel second.
    assert.ok(flow.indexOf('<WelcomeScreen') < flow.indexOf('<OnboardingCarousel'));
  });

  it("swipes using React Native's own pager, adding no dependency", () => {
    const carousel = code(CAROUSEL);

    assert.match(carousel, /pagingEnabled/);
    assert.match(carousel, /horizontal/);
    assert.match(carousel, /from 'react-native'/);

    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };
    for (const name of [
      'react-native-pager-view',
      'react-native-snap-carousel',
      'react-native-swiper',
    ]) {
      assert.equal(name in pkg.dependencies, false, name);
    }
  });

  it('advances and goes back exactly one slide', () => {
    const carousel = code(CAROUSEL);

    assert.match(carousel, /goTo\(index \+ 1\)/);
    assert.match(carousel, /goTo\(index - 1\)/);
  });

  it('cannot be scrolled past either end', () => {
    // Clamped rather than trusted: a fast swipe can report a page beyond the
    // last one, and an index past the end would blank the screen.
    const carousel = code(CAROUSEL);

    assert.match(carousel, /Math\.max\(0, Math\.min\(last, next\)\)/);
    assert.match(carousel, /Math\.max\(0, Math\.min\(last, page\)\)/);
  });

  it('keeps the buttons and the swipe agreeing on where the user is', () => {
    // The scroll view is the source of truth: buttons scroll it, and the
    // index is also updated from the scroll position when a swipe settles.
    const carousel = code(CAROUSEL);

    assert.match(carousel, /scroller\.current\?\.scrollTo\(/);
    assert.match(carousel, /onMomentumScrollEnd/);
  });

  it('measures its own width rather than assuming the window', () => {
    // Pages must be exactly as wide as the pager, which safe-area insets can
    // make narrower than the window.
    assert.match(code(CAROUSEL), /onLayout/);
  });

  it('shows where the user is, and not only by colour', () => {
    const carousel = code(CAROUSEL);

    assert.match(carousel, /Slide \$\{index \+ 1\} of \$\{ONBOARDING_SLIDES\.length\}/);
    // The current dot is a different width, so the position survives a
    // colour-blind reading.
    assert.match(carousel, /slideIndex === index \? 22 : 8/);
  });

  it('offers Skip everywhere except the final slide', () => {
    const carousel = code(CAROUSEL);

    assert.match(carousel, /isLast \? null : \(/);
    assert.match(carousel, /accessibilityLabel="Skip"/);
  });

  it('ends on a prominent Start Translating', () => {
    const carousel = code(CAROUSEL);

    assert.match(carousel, /isLast \? 'Start Translating' : 'Next'/);
    assert.match(carousel, /accessibilityLabel=\{isLast \? 'Start translating' : 'Next'\}/);
  });

  it('finishes through one path, whether skipped or completed', () => {
    const carousel = code(CAROUSEL);

    // Both Skip and the final action call `finish`, so onboarding is recorded
    // as done in one place rather than two that could drift.
    assert.match(carousel, /onPress=\{finish\}/);
    assert.match(carousel, /isLast \? finish\(\) : goTo\(index \+ 1\)/);
  });

  it('cannot finish twice on a double tap', () => {
    /*
     * A ref, checked and set synchronously. `onDone` writes a preference and
     * swaps the navigator in; a state flag would not have re-rendered in time
     * to block a second press landing in the same frame.
     */
    const carousel = code(CAROUSEL);

    assert.match(carousel, /const finished = useRef\(false\)/);
    assert.match(carousel, /if \(finished\.current\) return;/);
    assert.match(carousel, /finished\.current = true;/);
  });

  it('labels every control for a screen reader', () => {
    const carousel = code(CAROUSEL);

    for (const label of ['Skip', 'Previous']) {
      assert.ok(carousel.includes(`accessibilityLabel="${label}"`), label);
    }
    assert.match(carousel, /accessibilityRole="progressbar"/);
  });

  it('pays both safe areas', () => {
    assert.match(code(CAROUSEL), /edges=\{\['top', 'bottom', 'left', 'right'\]\}/);
  });

  it('persists nothing until it is finished', () => {
    // Which slide is showing is local state. Storing a step number would be a
    // thing to migrate the day a slide is added or removed.
    const flow = code(FLOW);

    assert.equal(flow.includes('usePreferences'), false);
    assert.equal(code(CAROUSEL).includes('usePreferences'), false);
    assert.match(flow, /useState\(false\)/);
  });
});

describe('the slides claim only what the app actually does', () => {
  const copy = ONBOARDING_SLIDES.map((slide) => `${slide.heading} ${slide.body}`)
    .join(' ')
    .toLowerCase();

  it('never promises that every language works offline', () => {
    /*
     * The claim that would be furthest from true. Every catalogue entry
     * reports `offline.supported: false`; a language becomes available
     * on-device only when the installed runtime reports it and a pack has
     * been downloaded.
     */
    for (const phrase of [
      'all languages offline',
      'every language offline',
      'any language offline',
      'all languages work offline',
    ]) {
      assert.equal(copy.includes(phrase), false, phrase);
    }
  });

  it('never claims translation is unlimited, instant or free of charge', () => {
    for (const word of ['unlimited', 'instantly', 'instant', 'always fast', 'no limits']) {
      assert.equal(copy.includes(word), false, word);
    }
  });

  it('makes no AI claim, because nothing here is one', () => {
    // The reference design leads with "AI-Powered Translations". Translita
    // routes to Azure Translator and to ML Kit, neither of which the app
    // has any business describing that way.
    for (const word of [' ai ', 'ai-powered', 'artificial intelligence', 'neural', 'gpt']) {
      assert.equal(copy.includes(word), false, word.trim());
    }
  });

  it('mentions no feature that does not exist', () => {
    for (const word of ['phrase', 'quotation', 'conversation mode', 'document', 'website']) {
      assert.equal(copy.includes(word), false, word);
    }
  });

  it('hedges the two device-dependent features', () => {
    // Dictation and the camera both depend on the platform, and both hide
    // themselves on a device that cannot do them.
    const speech = ONBOARDING_SLIDES.find((slide) => slide.key === 'speech');
    const camera = ONBOARDING_SLIDES.find((slide) => slide.key === 'camera');

    assert.match(speech?.body ?? '', /on supported devices/i);
    assert.match(camera?.body ?? '', /on supported devices/i);
  });

  it('says the camera reads Latin script, because that is all it reads', () => {
    // The bundled model needs no download, and the trade is script coverage.
    const camera = ONBOARDING_SLIDES.find((slide) => slide.key === 'camera');

    assert.match(camera?.body ?? '', /latin/i);
  });

  it('says a pack is one language, not one pair', () => {
    const packs = ONBOARDING_SLIDES.find((slide) => slide.key === 'packs');

    assert.match(packs?.body ?? '', /both sides/i);
  });

  it('counts languages from the catalogue instead of writing a number down', () => {
    // A number typed into copy goes stale the first time a language is added.
    const source = code('src/features/onboarding/onboarding-slides.ts');

    assert.match(source, /LANGUAGES\.length/);
    assert.ok(
      ONBOARDING_SLIDES.some((slide) => slide.heading.includes(String(LANGUAGES.length))),
      'no slide reports the catalogue size',
    );
  });

  it('describes routing the way the router actually behaves', () => {
    // `orderEngines` ranks online first when a connection is reported and
    // on-device first when it is not.
    const routing = ONBOARDING_SLIDES.find((slide) => slide.key === 'routing');

    assert.match(routing?.body ?? '', /connection/i);
    assert.match(routing?.body ?? '', /on-device|offline/i);
  });

  it('sells nothing, because onboarding is not a paywall', () => {
    for (const word of ['pro', 'subscri', 'upgrade', 'free trial', 'premium', 'ad-free']) {
      assert.equal(copy.includes(word), false, word);
    }
  });
});

describe('nothing was monetised in this step', () => {
  it('added no billing or advertising dependency', () => {
    const pkg = JSON.parse(read('package.json')) as {
      dependencies: Record<string, string>;
      devDependencies?: Record<string, string>;
    };

    const names = [...Object.keys(pkg.dependencies), ...Object.keys(pkg.devDependencies ?? {})];
    for (const name of names) {
      // One approved ad SDK is stepped over. RevenueCat, purchases, billing,
      // IAP, Firebase, auth and every other ad library still fail here.
      if (APPROVED_ADVERTISING.includes(name) || APPROVED_BILLING.includes(name)) continue;

      assert.equal(
        /revenuecat|purchases|billing|iap|admob|ads|firebase|auth/i.test(name),
        false,
        name,
      );
    }

    // Neither exemption can grow quietly.
    assert.equal(APPROVED_ADVERTISING.length, 1);
    assert.equal(APPROVED_BILLING.length, 1);
  });

  it('shows no advertisement and no placeholder pretending to be one', () => {
    for (const path of [TRANSLATE, TILES, WELCOME, ACTIONS]) {
      const source = code(path).toLowerCase();

      for (const word of ['adbanner', 'admob', 'advertis', 'sponsored']) {
        assert.equal(source.includes(word), false, `${word} in ${path}`);
      }
    }
  });
});
