import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

/**
 * A round of fixes found on a real phone: text cut to dots, a button under the
 * navigation bar, a highlight past a card's corners, a missing Listen button
 * and a hint where a search box belonged.
 *
 * Structural, like the rest of the screen tests — React Native will not render
 * under Node. Each test pins the specific thing that went wrong, so it cannot
 * quietly come back.
 */

const read = (path: string) => readFileSync(path, 'utf8');

/** Source with block comments and comment-only lines removed. */
const code = (path: string) =>
  read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

describe('More ways to translate', () => {
  const TILES = 'src/features/translation/components/feature-tiles.tsx';

  it('is an even grid of cards, with the words under the icon', () => {
    const tiles = code(TILES);

    // The tall card and the two small ones beside it had room for about five
    // letters, which is how "Camera" and "AI Practice" became dots.
    for (const gone of ['FeatureCard', 'CompactCard', "layout: 'feature'"]) {
      assert.equal(tiles.includes(gone), false, gone);
    }
    assert.match(tiles, /function GridCard/);
    assert.match(tiles, /direction="column"/);
  });

  it('never cuts a title or a description short', () => {
    const tiles = code(TILES);

    // A title shrinks a little rather than truncating; a description gets two
    // lines.
    assert.match(tiles, /adjustsFontSizeToFit/);
    assert.match(tiles, /numberOfLines=\{2\}/);
  });
});

describe('the camera scanner clears the navigation bar', () => {
  const SCANNER = 'src/features/camera/components/text-scanner.tsx';

  it('draws under both system bars on every Android version', () => {
    const scanner = code(SCANNER);

    assert.match(scanner, /statusBarTranslucent/);
    assert.match(scanner, /navigationBarTranslucent/);
  });

  it('lifts its controls by this device’s own navigation bar height', () => {
    const scanner = code(SCANNER);

    assert.match(scanner, /const insets = useSafeAreaInsets\(\);/);
    assert.match(scanner, /paddingBottom: insets\.bottom \+ theme\.spacing\.lg/);
  });
});

describe('a saved translation can be read aloud', () => {
  it('offers Listen, in the translation’s own language', () => {
    const screen = code('src/features/history/screens/history-detail-screen.tsx');

    assert.match(screen, /const speak = useSpeak\(\);/);
    assert.match(screen, /speak\.toggle\(record\.translatedText, record\.targetLanguage\)/);
    // Hidden on a device with no speech engine rather than failing.
    assert.match(screen, /speak\.available \? \(/);
  });
});

describe('pressed rows stay inside rounded cards', () => {
  it('clips edge-to-edge rows to the card’s corners, keeping its shadow', () => {
    const card = code('src/components/ui/card.tsx');

    assert.match(card, /padding === 'none' \? \(/);
    assert.match(card, /overflow: 'hidden'/);
    // On an inner layer, not the card itself, which would lose its shadow.
    assert.match(card, /borderRadius: bordered \? radius - theme\.layout\.borderWidth : radius/);
  });
});

describe('the language packs screen', () => {
  const SCREEN = 'src/features/offline/screens/language-packs-screen.tsx';

  it('has a title and no subtitle', () => {
    const screen = code(SCREEN);
    const header = screen.slice(screen.indexOf('<ScreenHeader'), screen.indexOf('leading='));

    assert.equal(header.includes('subtitle='), false);
  });

  it('offers search where the one-language note used to be', () => {
    const screen = code(SCREEN);

    assert.equal(screen.includes('A pack covers one language'), false);
    assert.match(screen, /<SearchField/);
    assert.match(screen, /searchPackSections\(listed, query\)/);
  });
});
