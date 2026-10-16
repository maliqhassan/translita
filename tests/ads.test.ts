import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { ADMOB } from '@/constants';

/**
 * The Conversation screen's interstitial.
 *
 * Structural, like the conversation screen's own tests: React Native will not
 * render under Node, so what is provable from source is that the entitlement
 * question lives in exactly one place — the ad hook itself — and never
 * reaches the screen, the same separation `conversation.test.ts` already
 * pins for `useEntitlements` generally.
 */

const read = (path: string) => readFileSync(path, 'utf8');

const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

const HOOK = 'src/features/ads/hooks/use-interstitial-ad.ts';
const SCREEN = 'src/features/conversation/screens/conversation-screen.tsx';
const APP_OPEN = 'src/features/ads/components/app-open-ad.tsx';
const UNITS = 'src/features/ads/ad-units.ts';

describe('the conversation interstitial', () => {
  it('decides eligibility itself, over adFree', () => {
    assert.match(code(HOOK), /has\('adFree'\)/);
    assert.equal(/plan === /.test(code(HOOK)), false);
  });

  it('never requests an ad for an eligible-checked-false account', () => {
    // `null` stops the underlying hook from creating an instance at all,
    // rather than creating one and merely not calling `show` on it.
    assert.match(code(HOOK), /adUnitId: eligible \? unitFor\('interstitial'\) : null/);
  });

  it('loads the next ad as soon as one is dismissed', () => {
    // The SDK loads once and stops. Without this, one interstitial per visit
    // was all the screen could ever show, however many replies followed.
    assert.match(code(HOOK), /if \(status === 'closed'\) \{\s*retry\(\);/);
  });

  it('waits before retrying a failed load, rather than looping', () => {
    const hook = code(HOOK);

    assert.match(hook, /status !== 'error' && status !== 'no-fill'/);
    assert.match(hook, /setTimeout\(retry, AD_RETRY_DELAY_MS\)/);
    assert.match(hook, /clearTimeout\(timer\)/);
  });

  it('tells the app-open ad that the next return is the end of this one', () => {
    assert.match(code(HOOK), /noteFullScreenAdShown\(\);\s*show\(\);/);
  });

  it('hands the screen one function and nothing else', () => {
    assert.match(code(HOOK), /: \(\) => void/);
  });

  it('is called from the conversation screen, which asks it nothing about the plan', () => {
    const screen = code(SCREEN);

    assert.match(screen, /useConversationInterstitialAd\(/);
    // The same guarantee `conversation.test.ts` pins for the rest of the
    // screen — adding the ad must not be the thing that breaks it.
    assert.equal(screen.includes('useEntitlements'), false);
    assert.equal(screen.includes("has('"), false);
  });

  it('loads the ads SDK only where it exists, so Expo Go does not crash', () => {
    // The package's entry calls `getEnforcing` on import and throws without
    // the native module. It is required in exactly one place, behind a
    // non-throwing check; nothing imports it directly.
    const loader = code('src/features/ads/native-ads.ts');

    assert.match(loader, /TurboModuleRegistry\.get\('RNGoogleMobileAdsModule'\)/);
    assert.match(loader, /require\('react-native-google-mobile-ads'\)/);

    for (const path of [HOOK, 'src/features/ads/components/banner-ad.tsx', APP_OPEN]) {
      assert.equal(
        /import \{[^}]*\} from 'react-native-google-mobile-ads'/.test(read(path)),
        false,
        `${path} imports the SDK directly`,
      );
      assert.match(read(path), /nativeAds/);
    }
  });

  it('fires from the reply callback, not from a fixed schedule', () => {
    const screen = code(SCREEN);

    assert.match(screen, /\(dueForAd, answer\) => \{/);
    assert.match(screen, /if \(dueForAd\) showInterstitial\(\);/);
  });

  it('waits for a spoken answer to finish before showing the ad', () => {
    // An advert's sound must never play over the translation being read out.
    assert.match(
      code(SCREEN),
      /void speak\.say\(answer\.text, answer\.language\)\.then\(\(\) => \{\s*if \(dueForAd\) showInterstitial\(\);/,
    );
  });
});

describe('the ad units', () => {
  it('all belong to the one AdMob publisher', () => {
    // They once carried an extra "04" in the publisher number — an account
    // that does not exist — so not one request could have been filled.
    const ids = Object.values(ADMOB);
    const publishers = ids.map((id) => /^ca-app-pub-(\d+)[~/]\d+$/.exec(id)?.[1]);

    for (const [index, publisher] of publishers.entries()) {
      assert.ok(publisher, `malformed id: ${ids[index]}`);
      assert.equal(publisher.length, 16, `not a 16-digit publisher: ${ids[index]}`);
    }
    assert.equal(new Set(publishers).size, 1, 'the ids name different publishers');
  });

  it('uses Google test units in development and the real ones only in release', () => {
    const units = code(UNITS);

    assert.match(units, /if \(__DEV__\)/);
    for (const test of ['TestIds.BANNER', 'TestIds.INTERSTITIAL', 'TestIds.APP_OPEN']) {
      assert.ok(units.includes(test), test);
    }
    for (const live of ['ADMOB.bannerAdUnit', 'ADMOB.interstitialAdUnit', 'ADMOB.appOpenAdUnit']) {
      assert.ok(units.includes(live), live);
    }
    // Development is decided first, so no path can reach a live unit from it.
    assert.ok(units.indexOf('__DEV__') < units.indexOf('ADMOB.bannerAdUnit'));
  });
});

describe('the app-open ad', () => {
  it('is mounted past onboarding only, so a first launch never sees it', () => {
    const layout = code('app/_layout.tsx');

    assert.match(layout, /<AppOpenAdController showOnLaunch=\{onboardedAtLaunch\} \/>/);
    assert.ok(
      layout.indexOf('if (!preferences.onboardingComplete)') <
        layout.indexOf('<AppOpenAdController'),
      'the controller renders before the onboarding gate',
    );
  });

  it('opens with an ad only for someone who had finished onboarding before this launch', () => {
    // Read once from the first render: finishing the tour flips the
    // preference, and must not turn that first session into one with an ad.
    // Nor the launch that asks an existing user which language the app speaks.
    assert.ok(
      code('app/_layout.tsx').includes(
        'preferences.onboardingComplete && preferences.appLanguageChosen,',
      ),
    );
    assert.match(code('app/_layout.tsx'), /const \[onboardedAtLaunch\] = useState\(/);

    const ad = code(APP_OPEN);
    assert.match(ad, /const launchSettled = useRef\(!showOnLaunch\);/);
    // A launch ad that arrives late is kept for the next return, not shown.
    assert.match(ad, /Date\.now\(\) - mountedAt\.current <= AD_PACING\.appOpenLaunchWaitMs/);
  });

  it('never covers the Pro screen', () => {
    const ad = code(APP_OPEN);

    assert.match(ad, /pathname === UPGRADE_ROUTE\) return;/);
    assert.match(ad, /ad\.pathname !== UPGRADE_ROUTE &&/);
  });

  it('never requests an ad for a Pro account', () => {
    const ad = code(APP_OPEN);

    assert.match(ad, /const eligible = loaded && !has\('adFree'\);/);
    assert.match(ad, /adUnitId: eligible \? unitFor\('appOpen'\) : null/);
  });

  it('shows only on a real return, never straight after another ad', () => {
    const ad = code(APP_OPEN);

    assert.match(ad, /ad\.eligible &&/);
    assert.match(ad, /ad\.status === 'loaded' &&/);
    assert.match(ad, /!returningFromAd &&/);
    assert.match(ad, /Date\.now\(\) - awaySince >= AD_PACING\.appOpenMinAwayMs &&/);
    assert.match(ad, /fullScreenAdSpacingElapsed\(\)/);
    assert.match(ad, /const returningFromAd = takeReturningFromAd\(\);/);
  });

  it('replaces a stale ad instead of showing it', () => {
    assert.match(code(APP_OPEN), /Date\.now\(\) - loadedAt\.current > MAX_AD_AGE_MS/);
  });

  it('keeps itself stocked the same way the interstitial does', () => {
    const ad = code(APP_OPEN);

    assert.match(ad, /if \(status === 'closed'\) \{\s*retry\(\);/);
    assert.match(ad, /setTimeout\(retry, AD_RETRY_DELAY_MS\)/);
  });
});

describe('the free plan is paced to sell Pro', () => {
  const INTERSTITIAL = 'src/features/ads/hooks/use-interstitial-ad.ts';
  const SHARED = 'src/features/ads/full-screen-ads.ts';

  it('keeps every pacing number in one place', () => {
    const config = read('src/constants/config.ts');

    assert.match(config, /export const AD_PACING = \{/);
    for (const key of [
      'translationsPerInterstitial',
      'minGapMs',
      'appOpenMinAwayMs',
      'appOpenLaunchWaitMs',
      'adsPerUpgradePrompt',
    ]) {
      assert.ok(config.includes(key + ':'), key);
    }
  });

  it('shows an interstitial on Translate, as the request goes out', () => {
    const screen = code('src/features/translation/screens/translate-screen.tsx');

    assert.match(screen, /const ads = useInterstitialAds\(\);/);
    // After the request starts, so the ad covers the wait, not the result.
    assert.match(screen, /translate\(\);[\s\S]{0,200}ads\.onTranslate\(\);/);

    const hook = code(INTERSTITIAL);
    assert.match(hook, /presses\.current < AD_PACING\.translationsPerInterstitial/);
    // Kept rather than reset when no ad was ready, so the next press retries.
    assert.match(hook, /if \(showIfReady\(\)\) presses\.current = 0;/);
  });

  it('never shows two full-screen ads back to back, of any kind', () => {
    assert.match(read(SHARED), /Date\.now\(\) - lastShownAt >= AD_PACING\.minGapMs/);
    assert.match(code(INTERSTITIAL), /!fullScreenAdSpacingElapsed\(\)/);
    assert.match(code(APP_OPEN), /fullScreenAdSpacingElapsed\(\)/);
  });

  it('leads on to the Pro screen every few ads a free user closes', () => {
    assert.match(read(SHARED), /closedCount % AD_PACING\.adsPerUpgradePrompt === 0/);

    assert.match(code(APP_OPEN), /if \(noteFullScreenAdClosed\(\)\) router\.push\(/);

    // The interstitial prompts too — unless something the user tapped is
    // waiting to open, which goes first rather than a second interruption.
    const interstitial = code(INTERSTITIAL);
    assert.match(interstitial, /const promptUpgrade = noteFullScreenAdClosed\(\);/);
    assert.match(
      interstitial,
      /if \(pending\.current\) runPending\(\);\s*else if \(promptUpgrade\) router\.push\('\/upgrade'\);/,
    );
  });

  it('keeps the Translate screen itself free of plan checks', () => {
    // The hook decides eligibility; the screen only says a press happened.
    const screen = code('src/features/translation/screens/translate-screen.tsx');

    assert.equal(screen.includes("has('adFree')"), false);
    assert.equal(screen.includes('useEntitlements'), false);
  });
});

describe('ads before opening a feature', () => {
  const INTERSTITIAL = 'src/features/ads/hooks/use-interstitial-ad.ts';
  const TRANSLATE = 'src/features/translation/screens/translate-screen.tsx';
  const CAMERA = 'src/features/camera/screens/camera-screen.tsx';

  it('spaces full-screen ads at least 20 seconds apart', () => {
    assert.match(read('src/constants/config.ts'), /minGapMs: 20_000,/);
  });

  it('shows one between the parts of a Fabalita lesson, on the free plan', () => {
    const lesson = code('src/features/academy/screens/lesson-screen.tsx');
    assert.match(lesson, /const ads = useInterstitialAds\(\);/);
    assert.ok(lesson.includes('steps[index]!.section !== steps[session.index]!.section'));
    assert.ok(lesson.includes('ads.openAfterAd(() => {});'));
  });

  it('shows one before Conversation and AI Practice open', () => {
    const screen = code(TRANSLATE);

    assert.match(screen, /ads\.openAfterAd\(\(\) => router\.push\('\/conversation'\)\)/);
    assert.match(
      screen,
      /ads\.openAfterAd\(\(\) =>\s*router\.push\(\{ pathname: '\/conversation', params: \{ mode: 'tutor' \} \}\),?\s*\)/,
    );
  });

  it('shows one before the camera scanner opens, from Home and from the Camera tab', () => {
    assert.match(
      code(TRANSLATE),
      /scan=\{\{ \.\.\.scan, open: \(\) => ads\.openAfterAd\(scan\.open\) \}\}/,
    );
    assert.match(code(CAMERA), /onPress=\{\(\) => ads\.openAfterAd\(scan\.open\)\}/);
  });

  it('always opens what was tapped, ad or no ad', () => {
    const hook = code(INTERSTITIAL);

    // No ad ready: open at once.
    assert.match(hook, /if \(!showIfReady\(\)\) \{\s*action\(\);\s*return;\s*\}/);
    // Ad closed, or failed on its way: open then.
    assert.match(hook, /if \(status === 'closed'\) \{[\s\S]{0,200}runPending\(\)/);
    assert.match(hook, /runPending\(\);\s*const timer = setTimeout\(retry, AD_RETRY_DELAY_MS\)/);
    // An ad that never starts cannot swallow the tap.
    assert.match(hook, /statusNow\.current !== 'showing'\) runPending\(\)/);
  });
});

describe('the banner reserves no space until it has an ad', () => {
  const BANNER = 'src/features/ads/components/banner-ad.tsx';

  it('opens its slot only once an ad has loaded', () => {
    const banner = code(BANNER);

    assert.match(banner, /height: filled \? BANNER_HEIGHT : 0,/);
    assert.match(banner, /onAdLoaded=\{\(\) => setFilled\(true\)\}/);
    // Still clipped hard, so the native view can never draw over the screen.
    assert.match(banner, /overflow: 'hidden'/);
  });

  it('draws no close button beside the ad', () => {
    // A control against an ad is what AdMob flags as inviting accidental
    // clicks; Pro is the way to remove it.
    const banner = code(BANNER);
    assert.equal(/accessibilityLabel="Close/.test(banner), false);
    assert.equal(banner.includes('<IconButton'), false);
  });
});
