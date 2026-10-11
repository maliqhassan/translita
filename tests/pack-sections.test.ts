import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { packSections, searchPackSections } from '@/features/offline/pack-sections';
import type { LanguagePack } from '@/services';

/**
 * The language packs screen's two groups: what was used recently, then the
 * rest. Pure, so the grouping is tested without rendering a list.
 */

const pack = (language: string, name: string): LanguagePack => ({
  modelId: language,
  language,
  name,
  nativeName: name,
  state: 'not_downloaded',
});

const PACKS = [
  pack('ar', 'Arabic'),
  pack('en', 'English'),
  pack('fr', 'French'),
  pack('de', 'German'),
  pack('ja', 'Japanese'),
];

const ids = (list: readonly LanguagePack[]) => list.map((item) => item.language);

describe('packSections', () => {
  it('lists recent languages first, in the order they were used', () => {
    const [recent, all] = packSections(PACKS, ['de', 'en']);

    assert.equal(recent?.title, 'Recently used');
    assert.deepEqual(ids(recent!.data), ['de', 'en']);
    assert.equal(all?.title, 'All languages');
  });

  it('never repeats a recent language under all languages', () => {
    const [, all] = packSections(PACKS, ['de', 'en']);

    assert.deepEqual(ids(all!.data), ['ar', 'fr', 'ja']);
  });

  it('skips detect-language, duplicates and languages with no pack', () => {
    const [recent] = packSections(PACKS, ['auto', 'de', 'de', 'xx', 'fr']);

    assert.deepEqual(ids(recent!.data), ['de', 'fr']);
  });

  it('keeps the shortlist short', () => {
    const [recent] = packSections(PACKS, ['ar', 'en', 'fr', 'de', 'ja'], 3);

    assert.equal(recent!.data.length, 3);
  });

  it('shows no empty heading', () => {
    const sections = packSections(PACKS, []);

    assert.deepEqual(
      sections.map((section) => section.key),
      ['all'],
    );
    assert.deepEqual(packSections([], ['en']), []);
  });
});

describe('searchPackSections', () => {
  it('finds a language by its English name, its own name or its code', () => {
    const packs = [...PACKS, { ...pack('es', 'Spanish'), nativeName: 'Español' }];

    for (const query of ['span', 'ESPAÑ', 'es']) {
      const [results] = searchPackSections(packs, query);
      assert.ok(results, query);
      assert.ok(ids(results.data).includes('es'), query);
    }
  });

  it('shows one Results section, and nothing for no match or an empty query', () => {
    const [results] = searchPackSections(PACKS, 'ger');
    assert.equal(results?.title, 'Results');
    assert.deepEqual(ids(results?.data ?? []), ['de']);

    assert.deepEqual(searchPackSections(PACKS, 'klingon'), []);
    assert.deepEqual(searchPackSections(PACKS, '   '), []);
  });
});
