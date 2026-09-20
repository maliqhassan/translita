import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { PRO_BENEFITS } from '@/features/paywall/pro-benefits';
import { CAPABILITIES, PLAN_CAPABILITIES } from '@/services/entitlements';
import { offlineTranslationPermittedFor } from '@/services/translation/offline-entitlement';

/**
 * Where entitlement decisions are allowed to live.
 *
 * React Native cannot render under Node, so the Camera OCR gate is pinned
 * structurally: that the hook owns the decision, that no component makes one,
 * and that nothing reaches the recogniser without going past the gate. The
 * decision itself — feature, then device, then plan — is a pure function and
 * is unit-tested in `entitlements.test.ts`.
 */

const read = (path: string) => readFileSync(path, 'utf8');

const HOOK = 'src/features/translation/hooks/use-camera-ocr.ts';
const SPEECH_HOOK = 'src/features/translation/hooks/use-speech-recognition.ts';
const COMPOSER = 'src/features/translation/components/translation-composer.tsx';
const CAMERA_SCREEN = 'src/features/camera/screens/camera-screen.tsx';
const SETTINGS = 'src/features/settings/screens/settings-screen.tsx';
const REGISTRY = 'src/services/service-registry.ts';
const UPGRADE = 'src/features/paywall/screens/upgrade-screen.tsx';

/** Every `.ts`/`.tsx` file under a directory. */
function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) sources(path, found);
    else if (/\.tsx?$/.test(entry.name)) found.push(path);
  }
  return found;
}

/**
 * A file with its comments removed.
 *
 * These rules are about what the code *does*. Without this, a comment saying
 * "never write `plan === 'pro'` here" is itself flagged as writing it — which
 * is both wrong and a good way to teach everyone to stop explaining the rule.
 * Only whole comment lines and block comments are stripped, so a `//` inside
 * a string literal cannot silently eat the code after it.
 */
function code(path: string): string {
  return read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\*)/.test(line))
    .join('\n');
}

/**
 * Tokens that mean a file has taken an entitlement decision of its own.
 *
 * Named specifically rather than matching a word like "capability": the model
 * registry has had a `RuntimeCapability` since long before plans existed, and
 * a rule that cannot tell the two apart is a rule nobody will keep.
 */
const ENTITLEMENT_TOKENS = [
  'useEntitlements',
  'services.entitlements',
  'resolveFeatureAccess',
  'PLAN_CAPABILITIES',
  'hasActiveCapability',
  'EntitlementsService',
  ...CAPABILITIES.map((capability) => `'${capability}'`),
];

const decidesEntitlement = (source: string) =>
  ENTITLEMENT_TOKENS.some((token) => source.includes(token));

describe('commercial rules live in one place', () => {
  it('has no plan comparison anywhere outside the entitlements module', () => {
    // The single rule this whole design exists to enforce. A `plan === 'pro'`
    // in a screen is a commercial decision written where nobody will find it
    // again when the tiers change.
    const offenders = sources('src')
      .filter((path) => !path.startsWith('src/services/entitlements/'))
      .filter((path) =>
        /(?:plan|tier)\s*(?:===|!==)\s*['"]|['"](?:pro|free)['"]\s*(?:===|!==)/.test(code(path)),
      );

    assert.deepEqual(offenders, []);
  });

  it('lets only the entitlements module import the plan-to-capability table', () => {
    const offenders = sources('src')
      .filter((path) => !path.startsWith('src/services/entitlements/'))
      .filter((path) => code(path).includes('PLAN_CAPABILITIES'));

    assert.deepEqual(offenders, []);
  });

  it('keeps components out of it entirely', () => {
    // `src/components` is the shared design system. Nothing in it may know
    // that plans exist, let alone which one the user is on.
    const offenders = sources('src/components').filter(
      (path) => decidesEntitlement(code(path)) || /Entitlements/.test(code(path)),
    );

    assert.deepEqual(offenders, []);
  });

  it('keeps the composer reacting to the controller, never to a plan', () => {
    const composer = code(COMPOSER);

    assert.equal(decidesEntitlement(composer), false);
    // It only ever reads the status the controller published.
    assert.match(composer, /scan\?\.status === 'locked'/);
  });

  it('keeps the camera screen reacting to the controller, never to a plan', () => {
    const screen = code(CAMERA_SCREEN);

    assert.equal(decidesEntitlement(screen), false);
    assert.match(screen, /scan\.status === 'locked'/);
  });

  it('asks the paywall screen a capability question, not a plan one', () => {
    const screen = code(UPGRADE);

    assert.match(screen, /has\(benefit\.capability\)/);
    assert.equal(/plan\s*(?:===|!==)/.test(screen), false);
  });

  it('renders plan copy from a table, the way theme and mode copy already is', () => {
    const settings = read(SETTINGS);

    assert.match(settings, /PLAN_LABELS: Record<Plan, string>/);
    assert.match(settings, /PLAN_SUBTITLES: Record<Plan, string>/);
  });
});

describe('the Camera OCR decision lives in the controller', () => {
  it('is the hook that reads the entitlement', () => {
    const hook = read(HOOK);

    assert.match(hook, /useEntitlements/);
    assert.match(hook, /has\('cameraOcr'\)/);
  });

  it('resolves it through the shared three-layer rule, not its own if-chain', () => {
    const hook = read(HOOK);

    assert.match(hook, /resolveFeatureAccess/);
    assert.match(hook, /shipped: FEATURES\.cameraOcr/);
    assert.match(hook, /supported,/);
    assert.match(hook, /entitled: has\('cameraOcr'\)/);
  });

  it('keeps the build flag as the first question', () => {
    const hook = read(HOOK);

    // The device is asked only when the capability shipped, so a build
    // without it never probes the recogniser at all.
    assert.match(hook, /if \(FEATURES\.cameraOcr\) \{[\s\S]*services\.ocr\.isAvailable\(\)/);
  });

  it('offers nothing at all until both answers are in', () => {
    // Otherwise a Pro user sees the lock flash up between the device probe
    // resolving and their plan arriving.
    assert.match(read(HOOK), /supported === undefined \|\| !loaded\s*\?\s*'unavailable'/);
  });

  it('publishes locked as a status of its own', () => {
    const hook = read(HOOK);

    assert.match(hook, /\| 'locked'/);
    assert.match(hook, /status: ScanStatus/);
  });
});

describe('a free user cannot reach the recogniser', () => {
  it('refuses to open the scanner', () => {
    assert.match(read(HOOK), /const open = useCallback\(\(\) => \{\s*if \(!allowed\) return;/);
  });

  it('refuses to recognise a capture even if one arrives', () => {
    // A second guard, so no stale callback or sheet left open can reach the
    // recogniser without the entitlement.
    assert.match(read(HOOK), /if \(!allowed \|\| reading\.current\) return;/);
  });

  it('reaches the recogniser only through the service, as before', () => {
    const hook = read(HOOK);

    assert.match(hook, /services\.ocr\.recognize/);
    // The gate did not become an excuse to move OCR out from behind the
    // service boundary.
    assert.equal(hook.includes('TranseeOcr'), false);
    assert.equal(hook.includes('expo-camera'), false);
  });

  it('leaves the OCR implementation itself untouched by entitlements', () => {
    const offenders = sources('src/services/ocr').filter((path) => decidesEntitlement(code(path)));

    assert.deepEqual(offenders, [], 'recognising text is not where plans belong');
  });
});

describe('an unsupported device is never sold anything', () => {
  it('refuses to open the paywall unless the feature is locked', () => {
    assert.match(read(HOOK), /if \(access !== 'locked'\) return;\s*router\.push\('\/upgrade'\)/);
  });

  it('hides the scan control entirely when it is unavailable', () => {
    const composer = read(COMPOSER);

    assert.match(composer, /canScan = scan && scan\.status !== 'unavailable'/);
    assert.match(composer, /\{canScan \?/);
  });

  it('keeps the device message and the plan message apart on the camera tab', () => {
    const screen = read(CAMERA_SCREEN);

    // Unavailable says what the build cannot do and offers nothing.
    assert.match(screen, /Scanning is not in this build/);
    assert.equal(/Scanning is not in this build[\s\S]{0,400}scan\.upgrade/.test(screen), false);

    // Locked says what the plan does not include and offers the upgrade.
    assert.match(screen, /Camera text recognition is part of Transee Pro/);
    assert.match(screen, /onPress=\{scan\.upgrade\}/);
  });

  it('leads a locked scan button to the paywall rather than the camera', () => {
    const composer = read(COMPOSER);

    assert.match(composer, /icon="lock-closed-outline"[\s\S]{0,200}onPress=\{scan\.upgrade\}/);
    assert.match(composer, /icon="camera-outline"[\s\S]{0,200}onPress=\{scan\.open\}/);
  });
});

describe('the development switcher cannot ship', () => {
  it('is the only thing the registry exposes a setter through', () => {
    const registry = read(REGISTRY);

    assert.match(registry, /const entitlementsService: EntitlementsService = localEntitlements/);
    assert.match(registry, /entitlements: entitlementsService/);
  });

  it('is behind a compile-time constant the bundler folds away', () => {
    assert.match(
      read(REGISTRY),
      /developmentEntitlements: DevelopmentEntitlementsService \| undefined = __DEV__\s*\?\s*localEntitlements\s*:\s*undefined/,
    );
  });

  it('keeps setPlan off the contract the app depends on', () => {
    const contract = read('src/services/entitlements/entitlements-service.ts');

    const base = contract.slice(
      contract.indexOf('export type EntitlementsService'),
      contract.indexOf('export type DevelopmentEntitlementsService'),
    );

    assert.ok(base.length > 0, 'both types are declared');
    assert.equal(base.includes('setPlan'), false, 'the base contract must have no setter');
    assert.match(
      contract,
      /DevelopmentEntitlementsService = EntitlementsService & \{[\s\S]*setPlan/,
    );
  });

  it('is reachable from the UI only through the development-only hook', () => {
    const offenders = sources('src')
      .filter((path) => path !== 'src/store/entitlements-store.tsx' && path !== REGISTRY)
      .filter((path) => read(path).includes('developmentEntitlements'));

    assert.deepEqual(offenders, []);
  });

  it('renders nothing in settings when there is no switcher', () => {
    const settings = read(SETTINGS);

    assert.match(settings, /const planSwitcher = useDevelopmentPlanSwitcher\(\)/);
    assert.match(settings, /\{planSwitcher \? \(/);
    assert.match(settings, /\) : null\}/);
  });

  it('says plainly that it is not a purchase', () => {
    assert.match(read(SETTINGS), /not a purchase/i);
  });

  it('never calls a setter from a screen or component', () => {
    const offenders = sources('src')
      .filter((path) => !path.startsWith('src/services/entitlements/'))
      .filter((path) => path !== 'src/store/entitlements-store.tsx')
      .filter((path) => /services\.entitlements\.setPlan|\.setPlan\(/.test(read(path)))
      .filter((path) => !path.includes('settings-screen'));

    assert.deepEqual(offenders, []);
  });
});

describe('the speech recognition decision lives in the controller', () => {
  it('is the hook that reads the entitlement', () => {
    const hook = read(SPEECH_HOOK);

    assert.match(hook, /useEntitlements/);
    assert.match(hook, /has\('speechRecognition'\)/);
  });

  it('resolves it through the same shared rule the camera uses', () => {
    const hook = read(SPEECH_HOOK);

    // Not a second copy of the ordering. If the rule ever changes, it changes
    // for both gates at once.
    assert.match(hook, /resolveFeatureAccess/);
    assert.match(hook, /shipped: FEATURES\.speechInput/);
    assert.match(hook, /supported,/);
    assert.match(hook, /entitled: has\('speechRecognition'\)/);
  });

  it('keeps the build flag as the first question', () => {
    // The device is asked only when the capability shipped, so a build
    // without it never probes the recogniser at all.
    assert.match(
      read(SPEECH_HOOK),
      /if \(FEATURES\.speechInput\) \{[\s\S]*services\.speech\.isAvailable\(\)/,
    );
  });

  it('offers nothing at all until both answers are in', () => {
    assert.match(read(SPEECH_HOOK), /supported === undefined \|\| !loaded\s*\?\s*'unavailable'/);
  });

  it('publishes locked as a status of its own', () => {
    const hook = read(SPEECH_HOOK);

    assert.match(hook, /\| 'locked'/);
    assert.match(hook, /status: SpeechStatus/);
  });

  it('keeps the flow states out of the gate states', () => {
    // `locked` and `unavailable` are decided by the gate; everything else is
    // the session's own business. The type says so rather than a comment.
    assert.match(
      read(SPEECH_HOOK),
      /type SpeechFlow = Exclude<SpeechStatus, 'unavailable' \| 'locked'>/,
    );
  });
});

describe('a free user cannot reach the microphone', () => {
  it('refuses to start or stop a session', () => {
    assert.match(read(SPEECH_HOOK), /\(language: LanguageCode\) => \{\s*if \(!allowed\) return;/);
  });

  it('re-checks after the permission dialog, which the plan can outlive', () => {
    // Awaiting a permission prompt is the one place a plan can change between
    // the tap and the microphone actually opening.
    assert.match(
      read(SPEECH_HOOK),
      /if \(!allowedNow\.current\) \{\s*busy\.current = false;\s*return;\s*\}\s*const started = await services\.speech\.start/,
    );
  });

  it('refuses to deliver a transcript, whatever produced it', () => {
    const hook = read(SPEECH_HOOK);

    // Both transcript events are guarded, so a session that outlived a plan
    // change cannot write into the draft.
    const guards = hook.match(/if \(!allowedNow\.current\) return;/g) ?? [];
    assert.equal(guards.length, 2, 'both partial and final are guarded');
  });

  it('closes the microphone when the entitlement goes away', () => {
    // The status would read locked either way; an open microphone behind a
    // lock is a privacy problem rather than a cosmetic one.
    assert.match(
      read(SPEECH_HOOK),
      /if \(allowed \|\| !busy\.current\) return;[\s\S]{0,200}services\.speech\.cancel\(\)/,
    );
  });

  it('reaches the recogniser only through the service, as before', () => {
    const hook = read(SPEECH_HOOK);

    assert.match(hook, /services\.speech\.start/);
    assert.equal(hook.includes('expo-speech-recognition'), false);
  });

  it('leaves the speech implementation itself untouched by entitlements', () => {
    const offenders = sources('src/services/speech').filter((path) =>
      decidesEntitlement(code(path)),
    );

    assert.deepEqual(offenders, [], 'recognising speech is not where plans belong');
  });
});

describe('an unsupported device is never sold dictation', () => {
  it('refuses to open the paywall unless the feature is locked', () => {
    assert.match(
      read(SPEECH_HOOK),
      /if \(access !== 'locked'\) return;\s*router\.push\('\/upgrade'\)/,
    );
  });

  it('hides the microphone entirely when it is unavailable', () => {
    const composer = read(COMPOSER);

    assert.match(composer, /canSpeak = speech && speech\.status !== 'unavailable'/);
    assert.match(composer, /\{canSpeak \?/);
  });

  it('leads a locked Speak button to the paywall rather than the microphone', () => {
    const composer = read(COMPOSER);

    assert.match(composer, /icon="lock-closed-outline"[\s\S]{0,200}onPress=\{speech\.upgrade\}/);
    assert.match(
      composer,
      /speech\.listening \? 'stop-circle' : 'mic-outline'[\s\S]{0,200}onPress=\{\(\) => speech\.toggle\(sourceLanguage\)\}/,
    );
  });

  it('keeps the composer reacting to the controller, never to a plan', () => {
    // The same rule the camera gate follows: the component reads a status and
    // makes no commercial judgement of its own.
    assert.match(read(COMPOSER), /speech\?\.status === 'locked'/);
    assert.equal(decidesEntitlement(code(COMPOSER)), false);
  });
});

describe('the entitlement system is wired in', () => {
  it('is bound in the registry over the existing storage seam', () => {
    const registry = read(REGISTRY);

    assert.match(registry, /createLocalEntitlementsService\(/);
    assert.match(
      registry,
      /createFilePreferencesStorage\(`\$\{STORAGE_KEYS\.entitlements\}\.json`\)/,
    );
  });

  it('introduced no new persistence dependency', () => {
    const offenders = sources('src/services/entitlements').filter((path) =>
      /expo-file-system|expo-sqlite|async-storage|expo-secure-store/.test(read(path)),
    );

    assert.deepEqual(offenders, [], 'entitlements reuse the preferences storage seam');
  });

  it('is composed into the provider tree', () => {
    const providers = read('src/store/app-providers.tsx');

    assert.match(providers, /<EntitlementsProvider>/);
    assert.match(providers, /<\/EntitlementsProvider>/);
  });

  it('re-publishes to the non-React bridge on every change', () => {
    const store = read('src/store/entitlements-store.tsx');

    assert.match(store, /publishActiveEntitlements/);
    assert.match(store, /services\.entitlements\.subscribe\(sync\)/);
  });

  it('has a route for the upgrade screen, as a one-line re-export', () => {
    assert.equal(
      read('app/upgrade.tsx').trim(),
      "export { UpgradeScreen as default } from '@/features/paywall';",
    );
    assert.match(read('app/_layout.tsx'), /name="upgrade"/);
  });
});

describe('the paywall is a placeholder and says so', () => {
  it('lists exactly the capabilities Pro grants', () => {
    assert.deepEqual(
      PRO_BENEFITS.map((benefit) => benefit.capability),
      [...PLAN_CAPABILITIES.pro],
    );
  });

  it('leaves no capability unexplained', () => {
    for (const capability of CAPABILITIES) {
      assert.ok(
        PRO_BENEFITS.some((benefit) => benefit.capability === capability),
        `${capability} is sold but never described`,
      );
    }
  });

  it('cannot take money or grant a plan', () => {
    const screen = code(UPGRADE);

    assert.match(screen, /disabled/);
    assert.match(screen, /coming soon/i);
    assert.equal(screen.includes('setPlan'), false);
    for (const word of ['purchase(', 'billing', 'revenuecat', 'sku', 'price']) {
      assert.equal(screen.toLowerCase().includes(word), false, word);
    }
  });

  it('adds no billing dependency', () => {
    const pkg = JSON.parse(read('package.json')) as { dependencies: Record<string, string> };

    for (const name of Object.keys(pkg.dependencies)) {
      assert.equal(
        /billing|purchase|revenuecat|iap|admob|ads/i.test(name),
        false,
        `${name} is not part of this step`,
      );
    }
  });

  it('carries no subscription secret and no new public variable', () => {
    for (const path of [
      ...sources('src/services/entitlements'),
      ...sources('src/features/paywall'),
    ]) {
      const source = read(path).toLowerCase();
      for (const word of ['expo_public_', 'apikey', 'api_key', 'secret', 'token']) {
        assert.equal(source.includes(word), false, `${word} in ${path}`);
      }
    }
  });

  it('states in the code that this is not purchase enforcement', () => {
    const contract = read('src/services/entitlements/entitlements-service.ts');
    const local = read('src/services/entitlements/local-entitlements-service.ts');

    assert.match(contract, /not purchase enforcement/i);
    assert.match(local, /not a licence check/i);
  });
});

describe('nothing else was gated', () => {
  // Speech recognition was ungated through Step 2A and is gated as of Step 2B;
  // its rules live in their own block above.

  it('leaves text-to-speech ungated', () => {
    assert.equal(decidesEntitlement(code('src/features/translation/hooks/use-speak.ts')), false);
  });

  it('leaves offline translation and language packs exactly as they were', () => {
    for (const path of [
      'src/features/offline/hooks/use-language-pack-status.ts',
      'src/features/offline/hooks/use-language-packs.ts',
      'src/features/offline/screens/language-packs-screen.tsx',
    ]) {
      assert.equal(decidesEntitlement(code(path)), false, path);
    }
  });

  it('confines the routing entitlement to the policy, router, cache and helper', () => {
    // Through Step 2B this asserted that routing knew nothing about
    // entitlements at all. Step 2C makes that false on purpose, so the rule
    // becomes *where* rather than *whether*: the engine gate reaches exactly
    // four files and no engine, provider or adapter below them.
    const offenders = sources('src/services/translation')
      .filter((path) => decidesEntitlement(code(path)) || code(path).includes('offlineEntitled'))
      .sort();

    assert.deepEqual(offenders, [
      'src/services/translation/caching-router.ts',
      'src/services/translation/offline-entitlement.ts',
      'src/services/translation/routing-policy.ts',
      'src/services/translation/translation-router.ts',
    ]);
  });

  it('still admits both real engines exactly as before', () => {
    // The one thing that would quietly gate offline translation is a change
    // to the candidate list. It is untouched.
    const registry = code(REGISTRY);

    assert.match(registry, /const translationEngines: readonly TranslationService\[\] = \[/);
    assert.match(registry, /onlineTranslationService,\s*offlineEngine,/);
  });
});

describe('the offline engine gate lives below the UI', () => {
  it('is decided in the routing and cache layer, never by a screen', () => {
    // A component that could decide whether an engine may *run* would be a
    // second gate, and the one a user could get around by reaching the router
    // another way. `orderEngines` and the `offlineEntitled` getter are that
    // decision; nothing above the services layer may touch either.
    const offenders = [...sources('src/features'), ...sources('src/components')].filter((path) =>
      /\bofflineEntitled\b|orderEngines/.test(code(path)),
    );

    assert.deepEqual(offenders, []);
  });

  it('keeps the bridge-reading helper out of React entirely', () => {
    // `offlineTranslationPermitted()` reads a module-level snapshot, so a
    // component calling it would not re-render when the plan changed and a
    // locked control would stay locked after an upgrade. Features get the
    // reactive form instead.
    const offenders = [...sources('src/features'), ...sources('src/components')].filter((path) =>
      /offlineTranslationPermitted\s*\(\s*\)/.test(code(path)),
    );

    assert.deepEqual(offenders, []);
  });

  it('gives the UI one door to the same rule', () => {
    // Presentation still has to agree with routing — a screen that offered
    // what routing refuses, or locked what it allows, is worse than either
    // behaviour alone. So the hook is the only feature-side caller.
    const callers = sources('src/features').filter((path) =>
      code(path).includes('offlineTranslationPermittedFor'),
    );

    assert.deepEqual(callers, ['src/features/offline/hooks/use-offline-entitlement.ts']);
  });

  it('leaves feature code choosing no engine at all', () => {
    // Everything above the services layer still reaches translation through
    // the router, exactly as before this step.
    const offenders = sources('src/features').filter((path) =>
      /services\.translation\.(offline|online)\b/.test(code(path)),
    );

    assert.deepEqual(offenders, []);
  });

  it('reads the plan only through the non-React bridge', () => {
    const helper = code('src/services/translation/offline-entitlement.ts');

    // Not a hook, not the store, not a copy of the plan table: the registry
    // and router are singletons built at import time and cannot use React.
    assert.match(helper, /hasActiveCapability/);
    assert.equal(helper.includes('useEntitlements'), false);
    assert.equal(helper.includes('PLAN_CAPABILITIES'), false);
    assert.equal(helper.includes('resolveFeatureAccess'), false);
  });

  it('keeps that helper the only thing combining the flag with the capability', () => {
    // Two copies of this rule would eventually disagree, and the disagreement
    // would be a free upgrade.
    const offenders = sources('src')
      .filter((path) => path !== 'src/services/translation/offline-entitlement.ts')
      .filter((path) => code(path).includes('FEATURES.offlineEntitlement'));

    assert.deepEqual(offenders, []);
  });

  it('asks the entitlement through a getter, so it cannot be captured', () => {
    const policy = read('src/services/translation/routing-policy.ts');
    const router = read('src/services/translation/translation-router.ts');
    const cache = read('src/services/translation/caching-router.ts');

    for (const [name, source] of [
      ['policy', policy],
      ['router', router],
      ['cache', cache],
    ] as const) {
      assert.match(source, /offlineEntitled\?: \(\) => boolean/, name);
    }
  });

  it('gates before the engine is asked anything about itself', () => {
    const policy = code('src/services/translation/routing-policy.ts');

    // The ordering inside isEligible is the gate. Availability and pair
    // support are the engine's own answers and must never be reached.
    assert.match(policy, /if \(engine === 'offline' && !offlineEntitled\) return false;/);
    assert.equal(policy.includes('isAvailable'), false);
    assert.equal(policy.includes('supportsPair'), false);
  });

  it('tells a locked-out user what is actually wrong', () => {
    const router = read('src/services/translation/translation-router.ts');

    // "no language pack is installed yet" would send them somewhere that
    // cannot help, so the entitlement is reported first.
    assert.match(
      router,
      /if \(mode === 'offline' && !offlineEntitled\) \{\s*return appError\('entitlement_required'/,
    );
  });

  it('gives that error its own code and its own copy', () => {
    assert.match(read('src/types/common.ts'), /\| 'entitlement_required'/);
    assert.match(read('src/constants/messages.ts'), /entitlement_required: '[^']+'/);
  });
});

describe('the offline entitlement UX is live', () => {
  const HOOK = 'src/features/offline/hooks/use-offline-entitlement.ts';

  it('has the rollout flag on', () => {
    // Built dormant and switched on once online translation was deployed and
    // verified on a device. Until then this asserted `false`, because gating
    // offline while it was the only working engine would have left free users
    // unable to translate at all.
    assert.match(read('src/constants/config.ts'), /offlineEntitlement: true/);
  });

  it('answers by capability now that enforcement is on', () => {
    // The property the whole step rests on, asserted against the real rule
    // rather than a copy of it. With the flag on the rule is the capability.
    assert.equal(offlineTranslationPermittedFor(false), false);
    assert.equal(offlineTranslationPermittedFor(true), true);
  });

  it('routes the UI and the router through one rule', () => {
    const helper = code('src/services/translation/offline-entitlement.ts');

    // `offlineTranslationPermitted` feeds the bridge answer into the same
    // function the hook calls, so presentation and routing cannot disagree.
    assert.match(
      helper,
      /offlineTranslationPermitted\(\): boolean \{\s*return offlineTranslationPermittedFor\(hasActiveCapability\('offlineTranslation'\)\)/,
    );
    assert.match(helper, /if \(!FEATURES\.offlineEntitlement\) return true;/);
  });

  it('gives the UI a reactive reader, not the snapshot one', () => {
    const hook = code(HOOK);

    // A component reading the module-level snapshot would not re-render on a
    // plan change, so a locked control would stay locked after upgrading.
    assert.match(hook, /useEntitlements/);
    assert.match(hook, /offlineTranslationPermittedFor\(has\('offlineTranslation'\)\)/);
  });
});

describe('a free user is not offered on-device translation', () => {
  const SETTINGS_SCREEN = 'src/features/settings/screens/settings-screen.tsx';

  it('offers the upgrade instead of selecting on-device mode', () => {
    const settings = code(SETTINGS_SCREEN);

    assert.match(settings, /if \(nextMode === 'offline' && !offlinePermitted\) \{/);
    assert.match(settings, /router\.push\('\/upgrade'\)/);
  });

  it('never rewrites the stored mode behind the user', () => {
    const settings = code(SETTINGS_SCREEN);

    // Someone who paid for on-device translation and lapsed keeps their
    // choice. The upgrade branch returns before `update` is reached.
    assert.match(
      settings,
      /router\.push\('\/upgrade'\);\s*return;\s*\}\s*update\(\{ translationMode: nextMode \}\)/,
    );
  });

  it('marks the language packs row as Pro rather than hiding it', () => {
    const settings = code(SETTINGS_SCREEN);

    // Still reachable: a lapsed subscriber has to get in to delete packs.
    assert.match(settings, /offlinePermitted \? 'cloud-download-outline' : 'lock-closed-outline'/);
    assert.match(settings, /onPress=\{\(\) => router\.push\('\/settings\/language-packs'\)\}/);
  });
});

describe('language packs respect the entitlement', () => {
  const PACKS_HOOK = 'src/features/offline/hooks/use-language-packs.ts';
  const PACKS_SCREEN = 'src/features/offline/screens/language-packs-screen.tsx';
  const PACK_ITEM = 'src/features/offline/components/language-pack-item.tsx';

  it('refuses to download in the controller, not only in the screen', () => {
    // A model is tens of megabytes. No stale callback or second entry point
    // may start one for a user whose plan cannot use the result.
    assert.match(read(PACKS_HOOK), /if \(!canDownload\) return;/);
  });

  it('leaves removal ungated', () => {
    const hook = read(PACKS_HOOK);

    // Reclaiming storage must never require a subscription. Scoped to the
    // callback itself: the returned object mentions `canDownload` as a field,
    // which is not a gate on removal.
    const remove = hook.slice(hook.indexOf('const remove = useCallback'), hook.indexOf('return {'));
    assert.ok(remove.length > 0, 'the remove callback was found');
    assert.equal(remove.includes('canDownload'), false);
    assert.match(hook, /deleteModel/);
  });

  it('offers no download control at all when locked', () => {
    // Omitted rather than disabled, so there is no dead button to press.
    assert.match(
      read(PACKS_SCREEN),
      /onDownload=\{canDownload \? onPress\(download\) : undefined\}/,
    );
    assert.match(read(PACK_ITEM), /const action = ready \? onRemove : onDownload;/);
    assert.match(read(PACK_ITEM), /\) : action \? \(/);
  });

  it('says why, once, rather than on every row', () => {
    const screen = read(PACKS_SCREEN);

    assert.match(screen, /available && !canDownload \?/);
    assert.match(screen, /Offline translation is part of Transee Pro/);
    assert.match(screen, /router\.push\('\/upgrade'\)/);
  });

  it('still lists what is already on the device', () => {
    // Hiding installed packs would make a lapsed subscriber think their
    // downloads were deleted.
    const screen = read(PACKS_SCREEN);
    assert.match(screen, /data=\{available \? packs : \[\]\}/);
    assert.match(screen, /can still be removed to free up space/);
  });
});

describe('a denied translation says what is actually wrong', () => {
  const TRANSLATE = 'src/features/translation/screens/translate-screen.tsx';
  const RESULT_CARD = 'src/features/translation/components/translation-result-card.tsx';

  it('maps the entitlement error before any readiness answer', () => {
    // Readiness would describe a device state the user cannot act on, so the
    // entitlement answer wins.
    assert.match(
      read(TRANSLATE),
      /if \(error\.code === 'entitlement_required'\) return offlineEntitlementNotice\(\);/,
    );
  });

  it('stops offering a pack download to someone who may not use one', () => {
    assert.match(read(TRANSLATE), /useOfflineReadiness\(mode !== 'online' && offlinePermitted\)/);
  });

  it('sends the entitlement notice to the paywall, not the packs screen', () => {
    const card = code(RESULT_CARD);

    assert.match(card, /const upgrading = notice\?\.actionTarget === 'upgrade';/);
    assert.match(card, /const onAction = upgrading \? onUpgrade : onOpenPacks;/);
  });

  it('drops "Try again" when retrying cannot possibly work', () => {
    // The plan will not have changed between two taps.
    assert.match(code(RESULT_CARD), /\{upgrading \? null : \(\s*<Button label="Try again"/);
  });

  it('names the plan rather than the language pair when there is no connection', () => {
    const router = code('src/services/translation/translation-router.ts');

    // "no on-device model covers en to de" blames the languages for something
    // changing them cannot fix.
    assert.match(
      router,
      /if \(networkStatus === 'offline' && !offlineEntitled\) \{\s*return appError\(\s*'entitlement_required'/,
    );
  });

  it('keeps that check ahead of the pair-blaming message', () => {
    const router = code('src/services/translation/translation-router.ts');
    const entitlement = router.indexOf("networkStatus === 'offline' && !offlineEntitled");
    const pairBlame = router.indexOf('no on-device model covers');

    assert.ok(entitlement > 0 && pairBlame > 0);
    assert.ok(entitlement < pairBlame, 'the entitlement branch must come first');
  });
});
