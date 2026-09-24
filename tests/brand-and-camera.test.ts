import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { darkColors, lightColors } from '@/constants/colors';
import { resolveInk } from '@/constants/ink';
import { palette } from '@/constants/palette';
import {
  clearPendingScan,
  consumePendingScan,
  setPendingScan,
} from '@/features/camera/pending-scan';
import { DEFAULT_PREFERENCES } from '@/services/preferences/preferences-schema';

/**
 * The brand colour, the default theme, and the Camera tab.
 *
 * The colour tests are the interesting ones: #70D6FF is light enough that
 * putting white on it is unreadable, so the rules that keep it legible are
 * worth pinning rather than trusting to memory.
 */

/** WCAG relative luminance, so the contrast claims here are computed, not asserted by eye. */
function luminance(hex: string): number {
  const value = hex.replace('#', '');
  const channels = [0, 2, 4].map((offset) => {
    const part = Number.parseInt(value.slice(offset, offset + 2), 16) / 255;
    return part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

function contrast(a: string, b: string): number {
  const first = luminance(a);
  const second = luminance(b);
  const [light, dark] = first > second ? [first, second] : [second, first];
  return ((light ?? 0) + 0.05) / ((dark ?? 0) + 0.05);
}

describe('the brand colour', () => {
  it('is the colour sampled from the logo', () => {
    // Taken from the artwork rather than chosen: #0CC0DF is the dominant
    // opaque pixel in `assets/images/icon.png`.
    assert.equal(palette.brand[400], '#0CC0DF');
    assert.equal(lightColors.primary, '#0CC0DF');
  });

  it('carries dark text on it, because white would be unreadable', () => {
    // White on #0CC0DF is 2.18:1. Like the sky blue it replaced, the brand is
    // a fill and not an ink, which is why the label colour moves with it.
    assert.ok(contrast('#0CC0DF', '#FFFFFF') < 3, 'white must be rejected');

    for (const theme of [lightColors, darkColors]) {
      assert.ok(
        contrast(theme.primary, theme.textOnPrimary) >= 4.5,
        `label on the brand fill is ${contrast(theme.primary, theme.textOnPrimary).toFixed(2)}:1`,
      );
    }
  });

  it('has an ink shade that is readable as text on the background', () => {
    for (const theme of [lightColors, darkColors]) {
      assert.ok(
        contrast(theme.primaryStrong, theme.background) >= 4.5,
        `brand ink on background is ${contrast(theme.primaryStrong, theme.background).toFixed(2)}:1`,
      );
    }
  });

  it('draws brand-coloured words in the ink, not the fill', () => {
    const theme = { colors: lightColors } as never;

    assert.equal(resolveInk(theme, 'primary'), lightColors.primaryStrong);
    // Everything else is unchanged.
    assert.equal(resolveInk(theme, 'danger'), lightColors.danger);
    assert.equal(resolveInk(theme, 'textMuted'), lightColors.textMuted);
  });

  it('keeps the header gradient legible in both themes', () => {
    for (const theme of [lightColors, darkColors]) {
      // The lighter stop is the harder one for the text sitting on it.
      const worst = Math.min(
        contrast(theme.gradientFrom, theme.onGradient),
        contrast(theme.gradientTo, theme.onGradient),
      );
      assert.ok(worst >= 4.5, `header text is ${worst.toFixed(2)}:1`);
    }
  });

  it('keeps the active tab readable on the tab bar', () => {
    for (const theme of [lightColors, darkColors]) {
      assert.ok(
        contrast(theme.tabBarActive, theme.tabBar) >= 3,
        `active tab is ${contrast(theme.tabBarActive, theme.tabBar).toFixed(2)}:1`,
      );
    }
  });
});

describe('the default appearance', () => {
  it('is light, not whatever the system is set to', () => {
    assert.equal(DEFAULT_PREFERENCES.theme, 'light');
  });

  it('still offers the other choices', () => {
    const settings = readFileSync('src/features/settings/screens/settings-screen.tsx', 'utf8');
    assert.match(settings, /'system', 'light', 'dark'/);
  });
});

describe('the Camera tab scans', () => {
  it('opens the camera itself rather than pointing elsewhere', () => {
    const screen = readFileSync('src/features/camera/screens/camera-screen.tsx', 'utf8');

    assert.match(screen, /useCameraOcr/);
    assert.match(screen, /TextScanner/);
    assert.match(screen, /label="Open camera"/);

    // The signpost it used to be is gone.
    assert.equal(screen.includes('Scan from the Translate tab'), false);
    assert.equal(screen.includes('Go to Translate'), false);
  });

  it('hands the text over instead of putting it in a route parameter', () => {
    const screen = readFileSync('src/features/camera/screens/camera-screen.tsx', 'utf8');

    assert.match(screen, /setPendingScan\(text\)/);
    // Route params end up in navigation state; this is the user's own words.
    assert.equal(/params:\s*\{[^}]*text/.test(screen), false);
  });

  it('is collected once by the translate screen and then forgotten', () => {
    const screen = readFileSync('src/features/translation/screens/translate-screen.tsx', 'utf8');

    assert.match(screen, /consumePendingScan\(\)/);
    assert.match(screen, /useFocusEffect/);
  });

  it('delivers a scan exactly once', () => {
    clearPendingScan();
    setPendingScan('Salida de emergencia');

    assert.equal(consumePendingScan(), 'Salida de emergencia');
    assert.equal(consumePendingScan(), undefined, 'a scan must not arrive twice');
  });

  it('ignores an empty capture', () => {
    clearPendingScan();
    setPendingScan('   ');

    assert.equal(consumePendingScan(), undefined);
  });

  it('trims what it hands over', () => {
    clearPendingScan();
    setPendingScan('  Ausgang \n');

    assert.equal(consumePendingScan(), 'Ausgang');
  });

  it('still does not translate on its own', () => {
    const screen = readFileSync('src/features/camera/screens/camera-screen.tsx', 'utf8');

    assert.equal(screen.includes('services.translation'), false);
    assert.equal(/\btranslate\(\)/.test(screen), false);
  });
});
