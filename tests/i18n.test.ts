import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, it } from 'node:test';

import {
  AD_PACING,
  AUTO_DETECT,
  ERROR_MESSAGES,
  LANGUAGE_CATALOG,
  SPEECH_ERROR_MESSAGES,
  UNAVAILABLE_INPUT_MESSAGES,
} from '@/constants';
import { ONBOARDING_SLIDES } from '@/features/onboarding/onboarding-slides';
import { starterPair } from '@/features/onboarding/starter-pair';
import { INCLUDED_ON_EVERY_PLAN, PRO_BENEFITS } from '@/features/paywall/pro-benefits';
import { proOfferDue } from '@/features/paywall/pro-offer';
import { PHRASE_CATEGORIES } from '@/features/phrases/phrase-catalog';
import {
  APP_LANGUAGES,
  isAppLanguage,
  isRtl,
  msg,
  setAppLanguage,
  t,
  type AppLanguageCode,
} from '@/i18n';
import { CATALOGS } from '@/i18n/catalogs';

const code = (file: string) => readFileSync(file, 'utf8');

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      // The catalogues hold the translations, not the keys.
      if (full !== path.join('src', 'i18n', 'catalogs')) sourceFiles(full, found);
    } else if (/\.tsx?$/.test(name)) {
      found.push(full);
    }
  }
  return found;
}

/** A quoted first argument to `t(` or `msg(`, unescaped. */
const LITERAL_KEY = /\b(?:t|msg)\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
const unescape = (text: string) => text.replace(/\\(.)/g, '$1');

/** Every English text the app can pass to `t()`. */
function allKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of [...sourceFiles('src'), ...sourceFiles('app')]) {
    for (const match of code(file).matchAll(LITERAL_KEY)) {
      keys.add(unescape(match[1] ?? match[2] ?? ''));
    }
  }
  // Text kept as data and translated where it is shown.
  for (const language of [AUTO_DETECT, ...LANGUAGE_CATALOG]) keys.add(language.name);
  for (const message of Object.values(ERROR_MESSAGES)) keys.add(message);
  for (const message of Object.values(UNAVAILABLE_INPUT_MESSAGES)) keys.add(message);
  for (const message of Object.values(SPEECH_ERROR_MESSAGES)) keys.add(message);
  for (const slide of ONBOARDING_SLIDES) keys.add(slide.heading).add(slide.body);
  for (const benefit of PRO_BENEFITS) keys.add(benefit.title).add(benefit.description);
  for (const feature of INCLUDED_ON_EVERY_PLAN) keys.add(feature.title);
  for (const category of PHRASE_CATEGORIES) {
    keys.add(category.label);
    for (const phrase of category.phrases) keys.add(phrase);
  }
  keys.delete('');
  return keys;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => setAppLanguage('en'));

describe('the app speaks the language the user chose', () => {
  it('offers twelve languages, each with a full catalogue except English', () => {
    assert.equal(APP_LANGUAGES.length, 12);
    for (const language of APP_LANGUAGES) {
      if (language.code === 'en') continue;
      assert.ok(CATALOGS[language.code], language.code);
    }
  });

  it('translates every text the app shows, in every language', () => {
    const keys = allKeys();
    // Guards the scan itself: a broken pattern would find nothing to check.
    assert.ok(keys.size > 400, `only ${keys.size} keys found`);

    for (const [language, catalog] of Object.entries(CATALOGS)) {
      const missing = [...keys].filter((key) => !(key in catalog));
      assert.deepEqual(missing, [], `${language} is missing translations`);
    }
  });

  it('keeps no translations for text the app no longer shows', () => {
    const keys = allKeys();
    for (const [language, catalog] of Object.entries(CATALOGS)) {
      const stale = Object.keys(catalog).filter((key) => !keys.has(key));
      assert.deepEqual(stale, [], `${language} has stale translations`);
    }
  });

  it('keeps every {placeholder}, so numbers and names still appear', () => {
    for (const [language, catalog] of Object.entries(CATALOGS)) {
      for (const [key, value] of Object.entries(catalog)) {
        assert.ok(value.trim().length > 0, `${language}: empty translation for "${key}"`);
        assert.deepEqual(placeholders(value), placeholders(key), `${language}: "${key}"`);
      }
    }
  });

  it('builds no key from a template, which no catalogue could match', () => {
    for (const file of [...sourceFiles('src'), ...sourceFiles('app')]) {
      assert.equal(/\b(?:t|msg)\(\s*`/.test(code(file)), false, file);
    }
  });
});

describe('the pair a new user starts on', () => {
  it('translates from the chosen language into English', () => {
    assert.deepEqual(starterPair('es'), { source: 'es', target: 'en' });
    assert.deepEqual(starterPair('ur'), { source: 'ur', target: 'en' });
    // The Portuguese the app is written in.
    assert.deepEqual(starterPair('pt'), { source: 'pt-BR', target: 'en' });
  });

  it('leaves English alone, since English into English translates nothing', () => {
    assert.equal(starterPair('en'), undefined);
  });

  it('is set once, in onboarding, when the language is confirmed, both sides at once', () => {
    const flow = code('src/features/onboarding/screens/onboarding-flow.tsx');
    assert.ok(flow.includes('const pair = starterPair(code, deviceRegion());'));
    assert.ok(flow.includes('if (pair) setPair(pair);'));
    // Not from Settings: changing the app's language later keeps the pair.
    const settings = code('src/features/settings/screens/app-language-screen.tsx');
    assert.equal(settings.includes('setPair'), false);
  });
});

describe('existing users are asked once', () => {
  const layout = () => code('app/_layout.tsx');
  const prompt = () => code('src/features/onboarding/screens/language-prompt.tsx');

  it('shows the language screen in place of the app until it is answered', () => {
    const gate = layout().indexOf('if (!preferences.appLanguageChosen)');
    assert.ok(gate > layout().indexOf('if (!preferences.onboardingComplete)'));
    assert.ok(gate < layout().indexOf('<Stack'));
    assert.ok(layout().includes('<LanguagePrompt />'));
  });

  it('opens on the phone language, and answers in one write either way', () => {
    assert.ok(prompt().includes('update({ appLanguage: deviceAppLanguage() })'));
    assert.ok(prompt().includes('onContinue={() => update({ appLanguageChosen: true })}'));
    // Closing puts back the language they had.
    assert.ok(
      prompt().includes(
        'onClose={() => update({ appLanguage: previous, appLanguageChosen: true })}',
      ),
    );
  });

  it('offers a close button and the back key, but only outside onboarding', () => {
    const screen = code('src/features/onboarding/screens/language-select-screen.tsx');
    assert.ok(screen.includes('{onClose ? ('));
    assert.ok(screen.includes("accessibilityLabel={t('Close and keep the current language')}"));
    assert.ok(screen.includes("BackHandler.addEventListener('hardwareBackPress'"));
    const flow = code('src/features/onboarding/screens/onboarding-flow.tsx');
    assert.equal(flow.includes('onClose='), false);
  });

  it('does not touch the translation pair of someone already using the app', () => {
    assert.equal(prompt().includes('setPair'), false);
  });
});

describe('the Pro offer after the first translations', () => {
  const flow = () => code('src/features/onboarding/screens/onboarding-flow.tsx');

  it('is not part of onboarding: the tour goes straight to Home', () => {
    assert.equal(flow().includes('<OnboardingPaywall'), false);
    assert.ok(flow().includes('return <OnboardingCarousel onDone={onComplete} />'));
  });

  it('opens once, on the third translation, and never for someone without ads', () => {
    assert.equal(AD_PACING.translationsBeforeProOffer, 3);
    assert.equal(proOfferDue(0, false, false), false);
    assert.equal(proOfferDue(1, false, false), false);
    assert.equal(proOfferDue(2, false, false), true);
    assert.equal(proOfferDue(2, true, false), false, 'already offered');
    assert.equal(proOfferDue(2, false, true), false, 'already ad-free');
    assert.match(code('src/features/translation/hooks/use-translation.ts'), /noteTranslation\(\);/);
  });

  it('closes to Home from the cross, the button and the back key', () => {
    const screen = code('src/features/paywall/screens/upgrade-screen.tsx');
    assert.ok(screen.includes("accessibilityLabel={t('Close and continue with ads')}"));
    assert.ok(screen.includes("hasEveryBenefit ? t('Continue') : t('Continue with ads')"));
    assert.ok(screen.includes("BackHandler.addEventListener('hardwareBackPress'"));
    assert.equal(screen.includes('onPress={close}'), false, 'a control skips onClose');
  });
});

describe('the phrasebook in another app language', () => {
  it('works into English when the app is not in English', () => {
    const screen = code('src/features/phrases/screens/phrases-screen.tsx');
    assert.ok(screen.includes("target !== PHRASEBOOK_LANGUAGE || appLanguage !== 'en'"));
    // English needs no request: each phrase is its own translation.
    const hook = code('src/features/phrases/hooks/use-phrase-translations.ts');
    assert.ok(hook.includes('target === PHRASEBOOK_LANGUAGE ? text : cache.get(key)'));
  });
});

describe('t()', () => {
  it('shows English as written, and fills placeholders', () => {
    assert.equal(t('Translate'), 'Translate');
    assert.equal(t('Search {count} languages', { count: 89 }), 'Search 89 languages');
    // An unknown placeholder stays visible rather than becoming "undefined".
    assert.equal(t('{missing} here'), '{missing} here');
  });

  it('switches language at once, and falls back to English for unknown text', () => {
    setAppLanguage('ur');
    assert.notEqual(t('Translate'), 'Translate');
    assert.equal(t('A sentence no catalogue has'), 'A sentence no catalogue has');
    setAppLanguage('es');
    assert.match(t('Search {count} languages', { count: 89 }), /89/);
  });

  it('marks without translating', () => {
    setAppLanguage('fr');
    assert.equal(msg('Translate'), 'Translate');
  });

  it('runs Urdu and Arabic right to left, and only those', () => {
    const rtl = APP_LANGUAGES.filter((language) => language.rtl).map((language) => language.code);
    assert.deepEqual(rtl.sort(), ['ar', 'ur']);
    for (const language of APP_LANGUAGES) {
      setAppLanguage(language.code);
      assert.equal(isRtl(), language.rtl, language.code);
    }
  });

  it('accepts only the languages it has', () => {
    for (const language of APP_LANGUAGES) assert.equal(isAppLanguage(language.code), true);
    for (const value of ['xx', 'EN', '', null, 3]) assert.equal(isAppLanguage(value), false);
    const codes: AppLanguageCode[] = APP_LANGUAGES.map((language) => language.code);
    assert.equal(new Set(codes).size, codes.length);
  });
});

describe('choosing the app language', () => {
  it('is asked right after the loading page, before anything with words in it', () => {
    const flow = code('src/features/onboarding/screens/onboarding-flow.tsx');
    const order = [
      '<LoadingScreen',
      '<LanguageSelectScreen',
      '<WelcomeScreen',
      '<OnboardingCarousel',
    ];
    const positions = order.map((tag) => flow.indexOf(tag));
    assert.ok(
      positions.every((at) => at >= 0),
      'a step is missing',
    );
    assert.deepEqual(
      [...positions].sort((a, b) => a - b),
      positions,
    );
    assert.ok(flow.includes("useState<Step>('loading')"));
  });

  it("starts on the phone's own language, set by the loading page", () => {
    const loading = code('src/features/onboarding/screens/loading-screen.tsx');
    assert.ok(loading.includes('update({ appLanguage: deviceAppLanguage() })'));
  });

  it('lists English first, and Urdu and Hindi nowhere near the top', () => {
    const codes = APP_LANGUAGES.map((language) => language.code);
    assert.equal(codes[0], 'en');
    assert.ok(codes.indexOf('ur') > 5 && codes.indexOf('hi') > 5);
  });

  it('shows each language with its flag', () => {
    const list = code('src/features/settings/components/app-language-list.tsx');
    assert.ok(list.includes('<FlagCircle language={item.languageId}'));
    // Every flag comes from a language the catalogue really has.
    for (const language of APP_LANGUAGES) {
      assert.ok(
        LANGUAGE_CATALOG.some((entry) => entry.id === language.languageId),
        language.code,
      );
    }
  });

  it('can be changed later from Settings', () => {
    const settings = code('src/features/settings/screens/settings-screen.tsx');
    assert.match(settings, /title=\{t\('App language'\)\}/);
    assert.match(settings, /router\.push\('\/settings\/app-language'\)/);
    assert.equal(
      code('app/settings/app-language.tsx').trim(),
      "export { AppLanguageScreen as default } from '@/features/settings';",
    );
  });

  it('redraws the navigator, and not the advert or paywall controllers', () => {
    const layout = code('app/_layout.tsx');
    assert.match(layout, /<Stack\s+key=\{language\}/);
    assert.equal(/<ThemeProvider key=/.test(layout), false);
    // Above the keyed navigator, so a language change does not replay them.
    assert.ok(layout.indexOf('<AppOpenAdController') < layout.indexOf('key={language}'));
  });

  it('is stored as a preference, never read from a storage API directly', () => {
    for (const file of sourceFiles('src/i18n')) {
      assert.equal(/expo-file-system|AsyncStorage|expo-sqlite/.test(code(file)), false, file);
    }
  });
});
