import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * The redesign's contract.
 *
 * Structural, because React Native cannot render under Node. What these pin is
 * the part that could quietly rot: that the gradient is drawn without a new
 * dependency, that it stays theme-aware, and above all that the polish did not
 * start inventing data the app does not have.
 */

const read = (path: string) => readFileSync(path, 'utf8');

const HEADER = 'src/components/layout/gradient-header.tsx';
const PICKER = 'src/features/translation/screens/language-picker-screen.tsx';
const ROW = 'src/features/translation/components/language-row.tsx';

describe('the gradient header', () => {
  it('is painted by the platform, with no drawing library added', () => {
    const header = read(HEADER);

    assert.match(header, /experimental_backgroundImage/);
    assert.match(header, /linear-gradient/);

    const deps = Object.keys(JSON.parse(read('package.json')).dependencies);
    for (const forbidden of [
      'expo-linear-gradient',
      'react-native-linear-gradient',
      'react-native-svg',
    ]) {
      assert.equal(deps.includes(forbidden), false, forbidden);
    }
  });

  it('falls back to a solid colour if the gradient cannot be drawn', () => {
    assert.match(read(HEADER), /backgroundColor: theme.colors.gradientFrom/);
  });

  it('takes its colours from tokens, never literals', () => {
    const header = read(HEADER);

    assert.match(header, /theme.colors.gradientFrom/);
    assert.match(header, /theme.colors.gradientTo/);
    assert.equal(/'#[0-9a-fA-F]{3,6}'/.test(header), false);
  });

  it('is defined in both themes', () => {
    const colors = read('src/constants/colors.ts');

    for (const token of ['gradientFrom', 'gradientTo', 'onGradient', 'onGradientMuted']) {
      // Once in the type, once per theme.
      assert.equal(
        (colors.match(new RegExp(token + ':', 'g')) ?? []).length,
        3,
        token + ' must be declared and defined twice',
      );
    }
  });

  it('pays its own top inset so the colour reaches the status bar', () => {
    assert.match(read(HEADER), /useSafeAreaInsets/);
    assert.match(read(HEADER), /paddingTop: insets.top/);
  });

  it('makes the screen stop reserving the top edge when it bleeds', () => {
    const screen = read('src/components/layout/screen.tsx');
    assert.match(screen, /headerBleed/);
    assert.match(screen, /edges.filter/);
  });
});

describe('the language picker', () => {
  it('lets the user switch side without going back', () => {
    const picker = read(PICKER);

    assert.match(picker, /SegmentedControl/);
    assert.match(picker, /label: 'FROM'/);
    assert.match(picker, /label: 'TO'/);
    assert.match(picker, /onChange={setSide}/);
  });

  it('still writes through the existing picker hook', () => {
    // The redesign must not have grown its own selection logic.
    assert.match(read(PICKER), /useLanguagePicker\(side, dismiss\)/);
  });

  it('shows offline status from the real runtime, not a hardcoded map', () => {
    const picker = read(PICKER);

    assert.match(picker, /useLanguagePackStatus/);
    assert.match(picker, /packState=\{packStatus\[item.language.id\]\}/);

    const hook = read('src/features/offline/hooks/use-language-pack-status.ts');
    assert.match(hook, /services.offlineModels.listModels/);
    assert.match(hook, /toLanguagePacks/);
  });

  it('draws no status at all for a language the runtime cannot serve', () => {
    // Undefined is not "not downloaded"; showing a cloud icon would promise a
    // download that can never happen.
    const row = read(ROW);
    assert.match(row, /packState \? PACK_ICON\[packState\] : undefined/);
    assert.match(row, /\{pack \? <Icon/);
  });

  it('covers every pack state the service can report', () => {
    const row = read(ROW);
    for (const state of ['ready', 'not_downloaded', 'downloading', 'removing', 'failed']) {
      assert.match(row, new RegExp(state + ':'), state);
    }
    assert.match(row, /satisfies Record<LanguagePackState/);
  });
});

describe('no second catalogue, and no invented data', () => {
  it('adds no flag assets or flag mapping', () => {
    // Our catalogue carries no region, and a flag per *language* would be a
    // guess: Arabic, Spanish and English have no single correct one.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = dir + '/' + entry.name;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && /flagEmoji|FLAGS|flagFor/.test(read(path))) {
          offenders.push(path);
        }
      }
    };
    walk('src');

    assert.deepEqual(offenders, []);
  });

  it('keeps the language catalogue as the only source of names', () => {
    const picker = read(PICKER);
    const row = read(ROW);

    assert.equal(/name: '(English|German|Spanish)'/.test(picker + row), false);
  });
});

describe('the redesign left the plumbing alone', () => {
  it('keeps every capability wired to its service', () => {
    const registry = read('src/services/service-registry.ts');

    for (const binding of [
      /ocr: ocrRecognizer/,
      /speech: expoSpeechRecognitionService/,
      /tts: expoTTSService/,
      /offlineModels: offlineRuntime/,
      /router: translationRouter/,
    ]) {
      assert.match(registry, binding);
    }
  });

  it('still records history through the one write path', () => {
    const record = read('src/features/translation/record-translation.ts');
    assert.match(record, /result.ok && options.saveHistory !== false/);
  });
});

describe('the header chrome', () => {
  it('uses a surface token for the brand tile, not a text colour', () => {
    // Painting the tile with the muted *ink* is what made it a dark square on
    // the light gradient: dark ink, dark tile.
    const mark = read('src/features/translation/components/brand-mark.tsx');

    assert.match(mark, /onGradientSurface/);
    assert.equal(
      mark.includes('backgroundColor: onGradient ? theme.colors.onGradientMuted'),
      false,
    );
  });

  it('defines that surface in both themes', () => {
    const colors = read('src/constants/colors.ts');
    assert.equal((colors.match(/onGradientSurface:/g) ?? []).length, 3);
  });

  it('keeps the subtitle to a single quiet line', () => {
    const header = read(HEADER);

    assert.match(header, /color="onGradientMuted" numberOfLines=\{1\}/);
  });
});

describe('the bottom navigation', () => {
  it('keeps a floor under the safe-area inset', () => {
    // A phone with three-button navigation in its own strip reports zero, and
    // the bar ended up sitting on the buttons.
    const bar = read('src/components/layout/tab-bar.tsx');
    assert.match(bar, /Math.max\(insets.bottom, theme.spacing.md\)/);
  });

  it('keeps inactive glyphs dark enough to see', () => {
    const colors = read('src/constants/colors.ts');
    assert.match(colors, /tabBarInactive: palette.neutral\[600\]/);
  });
});

describe('a failure names the real reason', () => {
  it('checks readiness in automatic mode, not only on-device', () => {
    // Otherwise an undownloaded pack reads as "this language pair is not
    // available yet", which blames the languages for a missing download.
    // Entitlement is the other exclusion: a pack is not the obstacle when the
    // feature itself is not included in the plan.
    const screen = read('src/features/translation/screens/translate-screen.tsx');
    assert.match(screen, /useOfflineReadiness\(mode !== 'online' && offlinePermitted\)/);
  });

  it('still shows the pre-emptive banner only on-device', () => {
    const screen = read('src/features/translation/screens/translate-screen.tsx');
    assert.match(screen, /readiness=\{mode === .offline. \? readiness : undefined\}/);
  });
});
