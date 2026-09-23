import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';

import { voiceSample } from '@/features/settings/voice-sample';
import {
  DEFAULT_PREFERENCES,
  createPreferencesService,
  parsePreferences,
  serializePreferences,
  type PreferencesStorage,
} from '@/services/preferences';
import {
  baseLanguageTag,
  speakOptionsFor,
  voiceMatchesLanguage,
} from '@/services/speech/speak-options';
import { SPEECH_RATES, type Preferences } from '@/types';
import { ok } from '@/utils';

/**
 * Milestone 10: choosing a voice and a speaking rate.
 *
 * The property everything else hangs off is that an install which never opens
 * these settings speaks exactly as it did before they existed — so the
 * defaults, and the options built from them, are pinned hardest.
 */

/** The same one-slot seam the file implementation fills, in memory. */
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

/** A stored payload from before these fields existed. */
const LEGACY = JSON.stringify({
  version: 1,
  sourceLanguage: 'en',
  targetLanguage: 'de',
  translationMode: 'auto',
  theme: 'light',
  saveHistory: true,
});

describe('speech rate defaults and validation', () => {
  it('defaults to the natural pace', () => {
    assert.equal(DEFAULT_PREFERENCES.speechRate, 1);
  });

  it('offers exactly the documented steps, slowest first', () => {
    assert.deepEqual([...SPEECH_RATES], [0.5, 0.75, 1, 1.25, 1.5]);
  });

  it('never offers a rate above 1.5', () => {
    // Faster than this is not followable in a language you are learning,
    // which is the whole reason the control exists.
    for (const rate of SPEECH_RATES) assert.ok(rate <= 1.5, `${rate} is too fast to offer`);
  });

  it('round-trips every offered rate', () => {
    for (const rate of SPEECH_RATES) {
      const stored = serializePreferences({ ...DEFAULT_PREFERENCES, speechRate: rate });
      assert.equal(parsePreferences(JSON.parse(stored)).speechRate, rate);
    }
  });

  it('falls back to 1 for anything not on the list', () => {
    // Checked by membership, not by range: a plausible 1.1 is still something
    // nobody could have chosen, so it is not clamped into place.
    for (const bad of [0, -1, 1.1, 2, 3, 99, Number.NaN, Number.POSITIVE_INFINITY]) {
      assert.equal(parsePreferences({ speechRate: bad }).speechRate, 1, String(bad));
    }
  });

  it('falls back to 1 for a rate of the wrong type entirely', () => {
    for (const bad of ['1.5', null, {}, [], true]) {
      assert.equal(parsePreferences({ speechRate: bad }).speechRate, 1);
    }
  });
});

describe('preferences saved before these fields existed', () => {
  it('still load, and gain the defaults', () => {
    const loaded = parsePreferences(JSON.parse(LEGACY));

    assert.equal(loaded.speechRate, 1);
    assert.equal(loaded.voiceId, undefined);
    assert.equal(loaded.voiceLanguage, undefined);
  });

  it('keep every field they did have', () => {
    const loaded = parsePreferences(JSON.parse(LEGACY));

    assert.equal(loaded.sourceLanguage, 'en');
    assert.equal(loaded.targetLanguage, 'de');
    assert.equal(loaded.translationMode, 'auto');
    assert.equal(loaded.saveHistory, true);
  });

  it('load through the service without failing', async () => {
    const loaded = await createPreferencesService(memoryStorage(LEGACY)).load();
    assert.equal(loaded.speechRate, 1);
  });
});

describe('a stored voice selection', () => {
  const chosen: Preferences = {
    ...DEFAULT_PREFERENCES,
    voiceId: 'com.example.voice.de',
    voiceLanguage: 'de',
  };

  it('round-trips with the language it was chosen for', () => {
    const loaded = parsePreferences(JSON.parse(serializePreferences(chosen)));

    assert.equal(loaded.voiceId, 'com.example.voice.de');
    assert.equal(loaded.voiceLanguage, 'de');
  });

  it('is dropped when the id is there but the language is not', () => {
    // Half a pair is unusable: an id alone could be applied to any language.
    const loaded = parsePreferences({ voiceId: 'x' });

    assert.equal(loaded.voiceId, undefined);
    assert.equal(loaded.voiceLanguage, undefined);
  });

  it('is dropped when the language is there but the id is not', () => {
    const loaded = parsePreferences({ voiceLanguage: 'de' });

    assert.equal(loaded.voiceId, undefined);
    assert.equal(loaded.voiceLanguage, undefined);
  });

  it('is dropped when the language is not one the catalogue knows', () => {
    const loaded = parsePreferences({ voiceId: 'x', voiceLanguage: 'klingon' });
    assert.equal(loaded.voiceId, undefined);
  });

  it('is dropped for malformed values rather than crashing', () => {
    for (const bad of [
      { voiceId: 42, voiceLanguage: 'de' },
      { voiceId: 'x', voiceLanguage: {} },
    ]) {
      const loaded = parsePreferences(bad);
      assert.equal(loaded.voiceId, undefined, JSON.stringify(bad));
    }
  });

  it('treats a blank id as no selection', () => {
    assert.equal(parsePreferences({ voiceId: '   ', voiceLanguage: 'de' }).voiceId, undefined);
  });

  it('writes no voice keys at all when nothing is selected', () => {
    // `undefined` would serialise away anyway; this pins that the stored file
    // stays the shape a legacy reader already copes with.
    const stored = JSON.parse(serializePreferences(DEFAULT_PREFERENCES)) as Record<string, unknown>;

    assert.equal('voiceId' in stored, false);
    assert.equal('voiceLanguage' in stored, false);
  });
});

describe('matching a voice to the language being spoken', () => {
  it('ignores region and separator', () => {
    assert.equal(baseLanguageTag('en-GB'), 'en');
    assert.equal(baseLanguageTag('en_GB'), 'en');
    assert.equal(baseLanguageTag('EN'), 'en');
  });

  it('accepts a regional voice for the base language', () => {
    assert.equal(voiceMatchesLanguage('en-GB', 'en'), true);
    assert.equal(voiceMatchesLanguage('en_US', 'en'), true);
  });

  it('refuses a different language', () => {
    assert.equal(voiceMatchesLanguage('de', 'fr'), false);
    assert.equal(voiceMatchesLanguage('de-AT', 'en-GB'), false);
  });
});

describe('script variants are not interchangeable', () => {
  /*
   * The catalogue holds `zh-Hans` and `zh-Hant` as separate languages, so a
   * voice saved for one must never be handed the other: that is the
   * difference between being read and being unreadable, not an accent.
   */
  it('refuses a Simplified voice for Traditional text', () => {
    assert.equal(voiceMatchesLanguage('zh-Hans', 'zh-Hant'), false);
  });

  it('refuses a Traditional voice for Simplified text', () => {
    assert.equal(voiceMatchesLanguage('zh-Hant', 'zh-Hans'), false);
  });

  it('accepts a script when it is the same script', () => {
    assert.equal(voiceMatchesLanguage('zh-Hans', 'zh-Hans'), true);
    assert.equal(voiceMatchesLanguage('zh-Hant', 'zh-Hant'), true);
  });

  it('ignores case and separator when comparing scripts', () => {
    assert.equal(voiceMatchesLanguage('ZH_HANS', 'zh-Hans'), true);
    assert.equal(voiceMatchesLanguage('zh_Hant', 'ZH-HANS'), false);
  });

  it('treats a tag with no script as compatible with either', () => {
    // Platforms report voices by region, not script — Android offers `zh-CN`,
    // never `zh-Hans`. Requiring a script that most tags do not carry would
    // reject every real voice and leave the user with silence.
    assert.equal(voiceMatchesLanguage('zh-CN', 'zh-Hans'), true);
    assert.equal(voiceMatchesLanguage('zh-TW', 'zh-Hant'), true);
    assert.equal(voiceMatchesLanguage('zh', 'zh-Hant'), true);
    assert.equal(voiceMatchesLanguage('zh-Hans', 'zh'), true);
  });

  it('still refuses a different base language that carries a script', () => {
    assert.equal(voiceMatchesLanguage('sr-Latn', 'zh-Hant'), false);
  });
});

describe('regional variants keep matching', () => {
  /*
   * Region is deliberately never compared. `en-GB` and `en-US` are accents of
   * one written language; so are `pt-BR` and `pt-PT`. Refusing them would
   * leave most users with no usable voice, which is a worse outcome than an
   * unexpected accent — and unlike script, it is still intelligible.
   */
  it('matches English regions to each other and to the bare tag', () => {
    assert.equal(voiceMatchesLanguage('en-GB', 'en-US'), true);
    assert.equal(voiceMatchesLanguage('en-US', 'en-GB'), true);
    assert.equal(voiceMatchesLanguage('en-GB', 'en'), true);
    assert.equal(voiceMatchesLanguage('en', 'en-AU'), true);
  });

  it('matches Portuguese variants, by the same deliberate rule', () => {
    // `BR` and `PT` are two-letter regions, not scripts, so this is the
    // accent case rather than the writing-system one.
    assert.equal(voiceMatchesLanguage('pt-BR', 'pt-PT'), true);
    assert.equal(voiceMatchesLanguage('pt-PT', 'pt-BR'), true);
  });

  it('does not let a region make unrelated languages match', () => {
    assert.equal(voiceMatchesLanguage('pt-BR', 'es-BR'), false);
    assert.equal(voiceMatchesLanguage('en-US', 'es-US'), false);
  });
});

describe('the options handed to the engine', () => {
  const withVoice = { speechRate: 1.25, voiceId: 'de-voice', voiceLanguage: 'de' };

  it('always names the target language', () => {
    assert.equal(speakOptionsFor('fr', { speechRate: 1 }).language, 'fr');
  });

  it('passes the chosen rate through', () => {
    for (const rate of SPEECH_RATES) {
      assert.equal(speakOptionsFor('de', { speechRate: rate }).rate, rate);
    }
  });

  it('includes the voice when it was chosen for this language', () => {
    assert.equal(speakOptionsFor('de', withVoice).voiceId, 'de-voice');
  });

  it('includes it for a regional variant of the same language', () => {
    assert.equal(speakOptionsFor('de-AT', withVoice).voiceId, 'de-voice');
  });

  it('omits the voice when the target language is something else', () => {
    // The saved selection is untouched — this utterance simply does not use
    // it — so returning to German would apply it again.
    const options = speakOptionsFor('fr', withVoice);

    assert.equal('voiceId' in options, false);
    assert.equal(options.language, 'fr');
    assert.equal(options.rate, 1.25);
  });

  it('omits the voice when there is no selection at all', () => {
    // The whole default-behaviour guarantee: with nothing chosen, the engine
    // receives exactly what it received before voices could be chosen.
    const options = speakOptionsFor('de', { speechRate: 1 });

    assert.equal('voiceId' in options, false);
    assert.deepEqual(options, { language: 'de', rate: 1 });
  });

  it('omits the voice when half the selection is missing', () => {
    assert.equal('voiceId' in speakOptionsFor('de', { speechRate: 1, voiceId: 'x' }), false);
    assert.equal('voiceId' in speakOptionsFor('de', { speechRate: 1, voiceLanguage: 'de' }), false);
  });

  it('never sets pitch, which this milestone does not offer', () => {
    assert.equal('pitch' in speakOptionsFor('de', withVoice), false);
  });

  it('omits a voice whose script does not match the target', () => {
    const simplified = { speechRate: 1, voiceId: 'zh-hans-voice', voiceLanguage: 'zh-Hans' };
    const options = speakOptionsFor('zh-Hant', simplified);

    assert.equal('voiceId' in options, false);
    // Still spoken, just in whatever voice the platform picks for the script.
    assert.deepEqual(options, { language: 'zh-Hant', rate: 1 });
  });

  it('applies that same voice when the script does match', () => {
    const simplified = { speechRate: 1, voiceId: 'zh-hans-voice', voiceLanguage: 'zh-Hans' };

    assert.equal(speakOptionsFor('zh-Hans', simplified).voiceId, 'zh-hans-voice');
  });

  it('leaves the saved selection untouched when it does not apply', () => {
    // The preferences object is the stored state; building options must read
    // it, never edit it. A user who returns to Simplified gets their voice
    // back rather than finding it silently cleared.
    const saved = { speechRate: 1, voiceId: 'zh-hans-voice', voiceLanguage: 'zh-Hans' };
    const before = { ...saved };

    speakOptionsFor('zh-Hant', saved);

    assert.deepEqual(saved, before);
    // And it is still applicable the moment the target comes back.
    assert.equal(speakOptionsFor('zh-Hans', saved).voiceId, 'zh-hans-voice');
  });

  it('still applies a voice across regions of one language', () => {
    const british = { speechRate: 1, voiceId: 'en-gb-voice', voiceLanguage: 'en-GB' };

    assert.equal(speakOptionsFor('en-US', british).voiceId, 'en-gb-voice');
    assert.equal(speakOptionsFor('en', british).voiceId, 'en-gb-voice');
  });
});

describe('the wiring around the settings', () => {
  const read = (path: string) => readFileSync(path, 'utf8');

  it('builds the options through the shared rule, not in the hook', () => {
    const hook = read('src/features/translation/hooks/use-speak.ts');

    assert.match(hook, /speakOptionsFor\(language, preferences\)/);
    assert.match(hook, /usePreferences/);
  });

  it('keeps play and stop exactly as they were', () => {
    const hook = read('src/features/translation/hooks/use-speak.ts');

    // Tapping while speaking still stops rather than queueing a second
    // utterance, and leaving the screen still silences it.
    assert.match(hook, /if \(speaking\) \{\s*stop\(\);\s*return;\s*\}/);
    assert.match(hook, /void services\.tts\.stop\(\)/);
  });

  it('still logs nothing, because the text is a user translation', () => {
    const hook = read('src/features/translation/hooks/use-speak.ts');
    assert.equal(/console\.|log\./.test(hook), false);
  });

  it('leaves expo-speech with exactly one importer', () => {
    const service = read('src/services/speech/expo-tts-service.ts');
    const options = read('src/services/speech/speak-options.ts');

    assert.match(service, /from 'expo-speech'/);
    assert.equal(options.includes('expo-speech'), false);
  });

  it('shares one base-tag rule between the picker and the gate', () => {
    // The service filtered voices with its own copy of this before the
    // preference existed; two copies would eventually disagree about whether
    // `en-GB` counts as English.
    const service = read('src/services/speech/expo-tts-service.ts');

    assert.match(service, /voiceMatchesLanguage/);
    assert.equal(/function baseTag\(/.test(service), false);
  });

  it('persists both settings through the existing preferences mechanism', () => {
    const settings = read('src/features/settings/screens/settings-screen.tsx');
    const voice = read('src/features/settings/screens/voice-screen.tsx');

    assert.match(settings, /update\(\{ speechRate: next\(SPEECH_RATES/);
    assert.match(voice, /update\(\{ voiceId: voice\.id, voiceLanguage: pair\.target \}\)/);
    assert.match(voice, /update\(\{ voiceId: undefined, voiceLanguage: undefined \}\)/);
  });

  it('scopes the picker to the current target language', () => {
    // Voices are listed per language, so offering any other language's would
    // be offering something that cannot read this translation.
    const voice = read('src/features/settings/screens/voice-screen.tsx');
    const hook = read('src/features/settings/hooks/use-voices.ts');

    assert.match(voice, /useVoices\(pair\.target\)/);
    assert.match(hook, /services\.tts\.getVoices\(language\)/);
  });

  it('shows Default rather than claiming a mismatched voice is in use', () => {
    const settings = read('src/features/settings/screens/settings-screen.tsx');

    assert.match(settings, /voiceMatchesLanguage\(preferences\.voiceLanguage, pair\.target\)/);
    assert.match(settings, /voiceInUse \? 'Custom' : 'Default'/);
  });

  it('explains an empty voice list instead of reporting a failure', () => {
    const voice = read('src/features/settings/screens/voice-screen.tsx');

    assert.match(voice, /voices on this device/);
    assert.match(voice, /default voice instead/);
  });

  it('adds no pitch control', () => {
    const settings = read('src/features/settings/screens/settings-screen.tsx');
    const voice = read('src/features/settings/screens/voice-screen.tsx');

    assert.equal(/pitch/i.test(settings), false);
    assert.equal(/pitch/i.test(voice), false);
  });
});

describe('the sample a voice is auditioned with', () => {
  it('speaks the voice own language, not English in a foreign voice', () => {
    // Hearing English words in a German voice says almost nothing about how
    // it will read a German translation.
    assert.notEqual(voiceSample('de'), voiceSample('en'));
    assert.match(voiceSample('de'), /Stimme/);
    assert.match(voiceSample('fr'), /voix/);
  });

  it('finds the sample by base tag, so regions and scripts share one', () => {
    assert.equal(voiceSample('de-AT'), voiceSample('de'));
    assert.equal(voiceSample('en_GB'), voiceSample('en'));
    assert.equal(voiceSample('zh-Hant'), voiceSample('zh-Hans'));
  });

  it('falls back to English rather than falling silent', () => {
    // A voice reading the wrong words is still a usable audition; no sound at
    // all tells the user nothing.
    const fallback = voiceSample('en');

    assert.equal(voiceSample('xx'), fallback);
    assert.equal(voiceSample(''), fallback);
  });

  it('is short enough to audition quickly', () => {
    for (const language of ['en', 'de', 'fr', 'es', 'ja', 'zh', 'ar']) {
      const sample = voiceSample(language);

      assert.ok(sample.length > 0, language);
      assert.ok(sample.length < 80, `${language} sample is too long to audition`);
    }
  });
});

describe('previewing a voice', () => {
  const HOOK = 'src/features/settings/hooks/use-preview-voice.ts';
  const SCREEN = 'src/features/settings/screens/voice-screen.tsx';
  const read = (path: string) => readFileSync(path, 'utf8');

  it('speaks with the requested voice and that voice language', () => {
    const hook = read(HOOK);

    assert.match(hook, /voiceSample\(voice\.language\)/);
    assert.match(hook, /language: voice\.language/);
    assert.match(hook, /voiceId: voice\.id/);
  });

  it('uses the configured speech rate', () => {
    assert.match(read(HOOK), /rate: preferences\.speechRate/);
  });

  it('never writes a preference', () => {
    // The whole distinction between auditioning and choosing. `update` is the
    // only way preferences change, and the preview hook must not reach it.
    const hook = read(HOOK);

    assert.equal(hook.includes('update('), false);
    assert.equal(hook.includes('voiceLanguage'), false);
    // It reads the rate, which is why `usePreferences` appears at all.
    assert.match(hook, /const \{ preferences \} = usePreferences\(\)/);
  });

  it('never touches the language pair or the translation router', () => {
    const hook = read(HOOK);

    assert.equal(hook.includes('useLanguagePair'), false);
    assert.equal(hook.includes('services.translation'), false);
  });

  it('stops whatever was playing before starting another', () => {
    // The engine queues by default, so two previews would otherwise overlap.
    assert.match(read(HOOK), /void services\.tts\.stop\(\);\s*\n\s*current\.current = voice\.id/);
  });

  it('treats a second tap on the same voice as stop', () => {
    assert.match(read(HOOK), /if \(current\.current === voice\.id\) \{\s*stop\(\);\s*return;\s*\}/);
  });

  it('clears the playing state however the utterance ends', () => {
    // Done, stopped and failure all settle the promise, so a row can never be
    // left showing a stop button for something that is no longer speaking.
    const hook = read(HOOK);

    assert.match(hook, /current\.current = undefined;\s*setPlayingId\(undefined\);/);
    assert.match(hook, /if \(!result\.ok\) setError\(result\.error\)/);
  });

  it('ignores the settlement of a preview that was superseded', () => {
    // Starting a second preview stops the first; that stop settles the first
    // promise, and acting on it would clear the new preview's state.
    assert.match(
      read(HOOK),
      /if \(!mounted\.current \|\| current\.current !== voice\.id\) return;/,
    );
  });

  it('stops the sample when the screen goes away', () => {
    const hook = read(HOOK);

    assert.match(hook, /mounted\.current = false;/);
    assert.match(hook, /return \(\) => \{[\s\S]{0,200}void services\.tts\.stop\(\);/);
  });

  it('reaches the engine only through the speech service', () => {
    const hook = read(HOOK);

    // Formatting may wrap the call, so the two halves are matched across any
    // whitespace between them.
    assert.match(hook, /services\.tts\s*\.speak/);
    assert.equal(hook.includes('expo-speech'), false);
  });

  it('keeps previewing and selecting as separate controls', () => {
    const screen = read(SCREEN);

    // The row selects; the button only auditions. One tappable row would
    // leave the user guessing which action they were about to take.
    assert.match(screen, /onPress=\{withPreviewStopped\(\(\) => choose\(item\)\)\}/);
    assert.match(screen, /onPress=\{\(\) => preview\.toggle\(item\)\}/);
  });

  it('labels the preview control for a screen reader, including its state', () => {
    const screen = read(SCREEN);

    assert.match(screen, /Stop previewing \$\{item\.name \|\| item\.id\}/);
    assert.match(screen, /Preview \$\{item\.name \|\| item\.id\} without selecting it/);
    assert.match(
      screen,
      /preview\.playingId === item\.id \? 'stop-circle' : 'play-circle-outline'/,
    );
  });

  it('stops the sample when a voice is chosen or cleared', () => {
    const screen = read(SCREEN);

    assert.match(screen, /onPress=\{withPreviewStopped\(useDefault\)\}/);
    assert.match(screen, /preview\.stop\(\);\s*act\(\);/);
  });

  it('reports a failed preview without hiding the list', () => {
    const screen = read(SCREEN);

    assert.match(screen, /preview\.error \?/);
    assert.match(screen, /could not be previewed/);
  });
});

describe('voice metadata the platform actually provides', () => {
  it('carries no gender, because expo-speech reports none', () => {
    // Android and iOS expose identifier, name, quality and language — no
    // gender. Inferring it from a voice name would be a guess presented as a
    // fact, so the list offers auditioning instead of a label.
    const contract = readFileSync('src/services/speech/tts-service.ts', 'utf8');
    const voiceType = contract.slice(
      contract.indexOf('export type Voice'),
      contract.indexOf('export type SpeakOptions'),
    );

    assert.ok(voiceType.length > 0, 'the Voice type is declared');
    assert.equal(/gender|male|female/i.test(voiceType), false);
  });

  it('is never guessed from a voice name anywhere in the app', () => {
    for (const path of [
      'src/features/settings/screens/voice-screen.tsx',
      'src/features/settings/hooks/use-preview-voice.ts',
      'src/services/speech/expo-tts-service.ts',
    ]) {
      assert.equal(/gender|\bmale\b|\bfemale\b/i.test(readFileSync(path, 'utf8')), false, path);
    }
  });
});
