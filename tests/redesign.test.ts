import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, it } from 'node:test';

import { darkColors, lightColors } from '@/constants/colors';

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
    assert.match(picker, /label: t\('From'\)/);
    assert.match(picker, /label: t\('To'\)/);
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
  it('keeps flags to one documented mapping, and only as a cue beside the name', () => {
    /*
     * This used to forbid flags outright: a flag per *language* is a guess,
     * since Arabic, Spanish and English have no single correct one. Flags
     * were then asked for on the language packs screen. The guess is now
     * made in exactly one place, with the rule written down beside it, and
     * the name still always comes from the catalogue.
     */
    const mappings: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = dir + '/' + entry.name;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && /const REGION\b/.test(read(path))) {
          mappings.push(path);
        }
      }
    };
    walk('src');

    assert.deepEqual(mappings, ['src/constants/language-flags.ts'], 'a second flag mapping');

    // Shown next to the catalogue name, never instead of it.
    const item = read('src/features/offline/components/language-pack-item.tsx');
    assert.match(item, /<FlagCircle language=\{pack\.language\} \/>/);
    assert.match(item, /\{t\(pack\.name\)\}/);
    assert.match(read('src/components/ui/flag-circle.tsx'), /languageRegion\(language\)/);
  });

  it('maps common languages to a country, and detect-language to none', async () => {
    const { languageRegion } = await import('@/constants/language-flags');

    assert.equal(languageRegion('de'), 'DE');
    assert.equal(languageRegion('pt-BR'), 'BR');
    assert.equal(languageRegion('zh-Hant'), 'TW');
    assert.equal(languageRegion('auto'), undefined);
  });

  it('bundles a real image for every country it maps to, so none is blank', () => {
    // Images, not emoji: each phone maker's emoji font draws flags at its own
    // size and offset, so emoji could not be cropped to a circle reliably.
    const regions = [...read('src/constants/language-flags.ts').matchAll(/: '([A-Z]{2})',/g)].map(
      (match) => match[1]!,
    );
    const images = read('src/constants/flag-images.ts');

    for (const region of new Set(regions)) {
      const file = 'assets/flags/' + region.toLowerCase() + '.png';
      assert.ok(existsSync(file), file + ' is missing');
      assert.equal(readFileSync(file).subarray(1, 4).toString(), 'PNG', file + ' is not a PNG');
      assert.ok(images.includes(region + ':'), region + ' is not in the image map');
    }
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
  it('shows the real logo on the page, with no square behind it', () => {
    // The mark is the launcher artwork itself, trimmed and transparent — not a
    // redrawing of it, and never sat on a cyan or black tile.
    const mark = read('src/features/translation/components/brand-mark.tsx');

    assert.match(mark, /require\('\.\.\/\.\.\/\.\.\/\.\.\/assets\/images\/logo-mark\.png'\)/);
    assert.equal(mark.includes('backgroundColor'), false, 'a tile crept back in');
    assert.match(mark, /resizeMode="contain"/);
  });

  it('ships every icon layer with transparency, at launcher size', () => {
    // Read straight from the PNG header: width and height at bytes 16–23,
    // colour type at 25, where 6 (RGBA) is the only type with alpha.
    const header = (path: string) => {
      const png = readFileSync(path);
      return { width: png.readUInt32BE(16), height: png.readUInt32BE(20), type: png[25] };
    };

    for (const path of [
      'assets/images/logo-mark.png',
      'assets/images/android-icon-foreground.png',
      'assets/images/android-icon-monochrome.png',
      'assets/images/splash-icon.png',
    ]) {
      assert.equal(header(path).type, 6, `${path} has no alpha channel`);
    }

    // Adaptive layers at the size the launcher resamples from, and the
    // monochrome layer no longer Expo's 432px placeholder.
    for (const path of [
      'assets/images/android-icon-foreground.png',
      'assets/images/android-icon-monochrome.png',
    ]) {
      assert.deepEqual(
        [header(path).width, header(path).height],
        [1024, 1024],
        `${path} is not 1024×1024`,
      );
    }
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
    // the bar ended up sitting on the buttons. The first floor was 12pt, which
    // was still too close on a real device; it is now a named layout token so
    // the number can be tuned without hunting through spacing steps.
    const bar = read('src/components/layout/tab-bar.tsx');
    assert.match(bar, /Math\.max\(insets\.bottom, theme\.layout\.tabBarFloorInset\)/);
  });

  it('gives that floor more room than a spacing step did', () => {
    // Measuring clearance from hardware, not rhythm: this wants to stay well
    // clear of the system keys, so it is asserted as a minimum rather than an
    // exact value.
    const layout = read('src/constants/layout.ts');
    const floor = Number(layout.match(/tabBarFloorInset: (\d+)/)?.[1]);

    assert.ok(Number.isFinite(floor), 'the token exists');
    assert.ok(floor >= 20, `expected at least 20pt of clearance, found ${floor}`);
  });

  it('keeps inactive glyphs dark enough to see', () => {
    // Computed rather than pinned to one token, so the palette can follow the
    // design while the legibility floor stays.
    const luminance = (hex: string) => {
      const channels = [1, 3, 5].map((i) => {
        const part = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
        return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
    };
    const contrast = (a: string, b: string) => {
      const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
      return (light! + 0.05) / (dark! + 0.05);
    };

    for (const theme of [lightColors, darkColors]) {
      const ratio = contrast(theme.tabBarInactive, theme.tabBar);
      assert.ok(ratio >= 4.5, `inactive tab is ${ratio.toFixed(2)}:1`);
    }
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
