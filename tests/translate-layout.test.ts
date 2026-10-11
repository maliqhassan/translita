import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The translate screen's layout contract.
 *
 * React Native cannot render under Node, so these pin the structural
 * decisions rather than pixels: that the keyboard is actually avoided, that
 * scanning is a named action rather than a mystery glyph, and that each panel
 * carries its own language.
 */

const read = (path: string) => readFileSync(path, 'utf8');

const SCREEN = 'src/features/translation/screens/translate-screen.tsx';
const COMPOSER = 'src/features/translation/components/translation-composer.tsx';
const RESULT = 'src/features/translation/components/translation-result-card.tsx';
const SCREEN_SHELL = 'src/components/layout/screen.tsx';

describe('the keyboard does not cover the input', () => {
  it('avoids the keyboard on every platform, not just iOS', () => {
    const shell = read(SCREEN_SHELL);

    // This was `Platform.OS === 'ios' ? 'padding' : undefined`, which left
    // Android doing nothing at all once edge-to-edge stopped the window
    // resizing for the keyboard.
    assert.match(shell, /behavior="padding"/);
    assert.equal(/behavior=\{Platform\.OS === 'ios'/.test(shell), false);
  });

  it('does not branch keyboard behaviour on platform any more', () => {
    const shell = read(SCREEN_SHELL);
    assert.equal(shell.includes('Platform'), false, 'the platform branch is gone entirely');
  });

  it('is switched on for the screen that has the text input', () => {
    assert.match(read(SCREEN), /keyboardAvoiding/);
  });

  it('lets a tap reach a control while the keyboard is up', () => {
    // Without this the first tap only dismisses the keyboard, so Scan and
    // Translate appear to need pressing twice.
    assert.match(read(SCREEN_SHELL), /keyboardShouldPersistTaps="handled"/);
  });
});

describe('scanning is a first-class input', () => {
  it('is a labelled action, not a bare icon', () => {
    const composer = read(COMPOSER);

    assert.match(composer, /label=\{t\('Scan'\)\}/);
    assert.match(composer, /icon="scan-outline"/);
  });

  it('sits alongside the other ways of getting text in', () => {
    const composer = read(COMPOSER);

    for (const label of ["label={t('Scan')}", "label={t('Paste')}"]) {
      assert.ok(composer.includes(label), label);
    }
    assert.match(composer, /speech\.listening \? t\('Stop'\) : t\('Speak'\)/);
  });

  it('says what it does, so the camera glyph never has to be guessed', () => {
    assert.match(
      read(COMPOSER),
      /accessibilityHint=\{t\('Opens the camera to read text from a picture'\)\}/,
    );
  });

  it('stays on the box even where the device cannot scan', () => {
    // Hiding it made the feature look removed — in Expo Go it was never
    // there. The control now always shows, and a tap explains itself.
    const composer = read(COMPOSER);

    assert.match(composer, /\{scan \? \(/);
    assert.match(composer, /\{speech \? \(/);
    assert.equal(/status !== 'unavailable'/.test(composer), false);
  });
});

describe('the pair reads as one From/To row', () => {
  it('names both sides at the top of the source card', () => {
    const composer = read(COMPOSER);

    assert.match(composer, /field="source"/);
    assert.match(composer, /field="target"/);
  });

  it('puts the swap control between them', () => {
    const composer = read(COMPOSER);

    const source = composer.indexOf('field="source"');
    const swap = composer.indexOf('<SwapLanguagesButton');
    const target = composer.indexOf('field="target"');

    assert.ok(source >= 0 && swap >= 0 && target >= 0, 'all three are rendered');
    assert.ok(source < swap && swap < target, 'From, swap, To, in that order');
  });

  it('names the target language in every state the result card draws', () => {
    const result = read(RESULT);

    // Three drawn branches — loading, error, success. Idle draws nothing.
    const headers = result.match(/\{overline\(/g) ?? [];
    assert.equal(headers.length, 3);
  });

  it('lets each side open the picker for itself', () => {
    const composer = read(COMPOSER);

    assert.match(composer, /onPress=\{\(\) => onSelectLanguage\('source'\)\}/);
    assert.match(composer, /onPress=\{\(\) => onSelectLanguage\('target'\)\}/);
    assert.match(read(SCREEN), /onSelectLanguage=\{openPicker\}/);
  });

  it('has no separate language bar left over', () => {
    // Both languages used to be named in a bar above the panels; that would
    // now say everything twice.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && read(path).includes('LanguageBar')) {
          offenders.push(path);
        }
      }
    };
    walk('src');

    assert.deepEqual(offenders, []);
  });
});

describe('the translate action stays explicit', () => {
  it('keeps a full-width Translate button', () => {
    const screen = read(SCREEN);

    assert.match(screen, /label=\{t\('Translate'\)\}/);
    assert.match(screen, /onPress=\{submit\}/);
  });

  it('puts the keyboard away before translating, so the result lands in view', () => {
    const screen = read(SCREEN);

    assert.match(
      screen,
      /const submit = useCallback\(\(\) => \{\s*Keyboard\.dismiss\(\);\s*if \(!canTranslate\) return;\s*translate\(\);/,
    );
  });

  it('disables it while a translation is in flight', () => {
    // This is what stops a double tap producing two history rows.
    assert.match(read(SCREEN), /loading=\{isTranslating\}/);
  });
});

describe('nothing hides under the system navigation', () => {
  it('keeps the tab bar clear of the system navigation', () => {
    // Android draws edge to edge. The old bar set a bare height and put its
    // labels behind the gesture pill or the back/home/recents buttons; the
    // custom bar pays the inset itself.
    const bar = read('src/components/layout/tab-bar.tsx');

    assert.match(bar, /useSafeAreaInsets/);
    assert.match(bar, /paddingBottom: Math\.max\(insets\.bottom/);
  });

  it('lays the tab bar out in the flow, so content cannot scroll under it', () => {
    // An absolutely positioned bar floats over the screen and re-creates the
    // very problem the inset above exists to fix.
    const bar = read('src/components/layout/tab-bar.tsx');
    assert.equal(/position: 'absolute'/.test(bar), false);
  });

  it('keeps every tab announceable and its selection audible', () => {
    // A hand-written bar has to carry the accessibility the built-in one gave
    // away for free.
    const bar = read('src/components/layout/tab-bar.tsx');

    assert.match(bar, /accessibilityRole="button"/);
    assert.match(bar, /accessibilityState=\{\{ selected: isFocused \}\}/);
    assert.match(bar, /accessibilityLabel=\{accessibilityLabel\}/);
  });

  it('still lets a tabPress listener cancel the navigation', () => {
    // This is how "tap the tab you are already on" can scroll to top instead.
    const bar = read('src/components/layout/tab-bar.tsx');

    assert.match(bar, /canPreventDefault: true/);
    assert.match(bar, /!event\.defaultPrevented/);
    assert.match(bar, /tabLongPress/);
  });

  it('opts every pushed screen into the bottom safe area', () => {
    // These sit above no tab bar, so nothing else reserves the room for them.
    // What matters is that `bottom` is claimed; whether `top` is depends on
    // whether the screen has a bleeding gradient header that owns it instead.
    for (const path of [
      'src/features/camera/screens/camera-result-screen.tsx',
      'src/features/history/screens/history-detail-screen.tsx',
      'src/features/offline/screens/language-packs-screen.tsx',
      'src/features/translation/screens/language-picker-screen.tsx',
    ]) {
      assert.match(read(path), /edges=\{\[[^\]]*'bottom'[^\]]*\]\}/, path);
    }
  });

  it('leaves tab screens on the top edge only', () => {
    // The tab bar already pays the bottom inset; doing it here too would leave
    // a strip of dead space above the tabs.
    const translate = read(SCREEN);
    assert.equal(translate.includes("'bottom'"), false);
  });
});

describe('each build is distinguishable from the last', () => {
  it('auto-increments the version code for preview builds', () => {
    const eas = JSON.parse(read('eas.json'));

    // Every preview APK shipped as versionCode 1, so Android could not tell a
    // new install from the one already on the phone.
    assert.equal(eas.build.preview.autoIncrement, true);
  });

  it('keeps the version the same in all three places that state it', () => {
    const app = JSON.parse(read('app.json')).expo.version;
    const pkg = JSON.parse(read('package.json')).version;
    const shown = read('src/constants/config.ts').match(/version: '([^']+)'/)?.[1];

    // Settings shows the constant, so a drift here would report a version the
    // build does not have.
    assert.equal(app, pkg);
    assert.equal(app, shown);
  });
});
