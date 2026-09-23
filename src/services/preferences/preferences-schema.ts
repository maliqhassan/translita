import { DEFAULTS, getLanguage, isAutoDetect } from '@/constants';
import { SPEECH_RATES } from '@/types';
import type { Preferences, SpeechRate, ThemePreference, TranslationMode } from '@/types';

/**
 * The stored shape of preferences, and the rules for reading it back safely.
 *
 * Stored data is treated as untrusted input. A file can be truncated, written
 * by an older or newer build, or edited on a rooted device — so every field is
 * validated independently and anything unusable falls back to its default.
 * A bad value costs that one setting, never the launch.
 */

/**
 * Bumped when the stored shape changes in a way older readers cannot handle.
 *
 * Migration is per-field rather than per-version: unknown fields are ignored
 * and missing ones default, which means adding a preference needs no
 * migration at all. The version exists for the rarer case of a field changing
 * *meaning*, where `migrate` below is the place to translate it.
 */
export const PREFERENCES_VERSION = 2;

export const DEFAULT_PREFERENCES: Preferences = {
  sourceLanguage: DEFAULTS.sourceLanguage,
  targetLanguage: DEFAULTS.targetLanguage,
  translationMode: 'auto',
  // Light by default rather than following the system: the design is built
  // and reviewed in light mode, and a first launch should look the way it was
  // designed. Dark mode stays available and is still a one-tap choice.
  theme: 'light',
  saveHistory: true,
  // The engine's natural pace, and no voice chosen: an install that has never
  // opened Settings speaks exactly as it did before these fields existed.
  speechRate: 1,
  // A fresh install has not been through the welcome screen. Existing installs
  // are migrated to true rather than taking this default — see `migrate`.
  onboardingComplete: false,
};

const TRANSLATION_MODES: readonly TranslationMode[] = ['auto', 'online', 'offline'];
const THEMES: readonly ThemePreference[] = ['system', 'light', 'dark'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

/** A language is only accepted if the catalogue still knows it. */
function readLanguage(value: unknown, fallback: string): string {
  return typeof value === 'string' && getLanguage(value) ? value : fallback;
}

/**
 * A rate is only accepted if it is one of the steps the UI can actually show.
 *
 * Checked by membership rather than by range, so a plausible-looking 1.1 — or
 * a 3 from an edited file — falls back to the natural pace instead of being
 * clamped into something nobody chose. `NaN` and `Infinity` fail the same way.
 */
function readSpeechRate(value: unknown, fallback: SpeechRate): SpeechRate {
  return typeof value === 'number' && SPEECH_RATES.includes(value as SpeechRate)
    ? (value as SpeechRate)
    : fallback;
}

/**
 * A non-empty string, or undefined.
 *
 * Voice ids are the platform's own opaque identifiers, so there is nothing to
 * validate beyond the shape: a device that no longer has the voice simply
 * ignores it and speaks in its default, which is the same outcome as never
 * having chosen one.
 */
function readOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

/**
 * The voice and the language it was chosen for, kept or dropped together.
 *
 * Half a pair is unusable: an id with no language could be applied to the
 * wrong language, and a language with no id says nothing. Either the record
 * has both and the language is still in the catalogue, or there is no
 * selection at all.
 */
function readVoice(
  record: Record<string, unknown>,
): Pick<Preferences, 'voiceId' | 'voiceLanguage'> {
  const voiceId = readOptionalString(record.voiceId);
  const language = readOptionalString(record.voiceLanguage);

  if (!voiceId || !language || !getLanguage(language)) return {};

  return { voiceId, voiceLanguage: language };
}

/**
 * A pair with the same language on both sides cannot translate anything, and
 * the language rules never produce one. Repair rather than store nonsense —
 * and make sure the repair itself does not collide.
 */
function repairTarget(source: string, target: string): string {
  if (target !== source) return target;
  return DEFAULT_PREFERENCES.targetLanguage === source
    ? DEFAULT_PREFERENCES.sourceLanguage
    : DEFAULT_PREFERENCES.targetLanguage;
}

/**
 * Hook for shape changes between versions.
 *
 * Version 2 added `onboardingComplete`, and it is the case the version number
 * exists for: reading the field as missing-means-default would be *wrong* for
 * everyone who already had the app. Their file is proof they have used it, so
 * they are migrated to true and never see the welcome screen.
 *
 * This is safe precisely because nothing writes preferences on load — the file
 * appears only once the user changes something. A stored record therefore
 * means a deliberate act, not merely a launch, and cannot be produced by a
 * first run that was interrupted before Get Started.
 *
 * The one install this treats as new is an existing user who never changed a
 * single setting. They have no file to migrate and are indistinguishable from
 * a fresh install; they see the welcome screen once. Nothing is lost —
 * preferences and history are untouched either way.
 */
function migrate(record: Record<string, unknown>, version: number): Record<string, unknown> {
  if (version >= PREFERENCES_VERSION) return record;

  // Explicitly stored values still win, so a version-1 file that somehow
  // carries the field keeps what it says.
  return { onboardingComplete: true, ...record };
}

/**
 * Parses stored preferences, always returning a usable object.
 *
 * Never fails: unreadable input yields the defaults, and a partially valid
 * object keeps the fields that made sense.
 */
export function parsePreferences(payload: unknown): Preferences {
  if (!isRecord(payload)) return { ...DEFAULT_PREFERENCES };

  const version = typeof payload.version === 'number' ? payload.version : 0;
  const record = migrate(payload, version);

  const source = readLanguage(record.sourceLanguage, DEFAULT_PREFERENCES.sourceLanguage);
  const stored = readLanguage(record.targetLanguage, DEFAULT_PREFERENCES.targetLanguage);
  // `auto` means "detect the source" and is never a valid target.
  const target = isAutoDetect(stored) ? DEFAULT_PREFERENCES.targetLanguage : stored;

  return {
    sourceLanguage: source,
    targetLanguage: repairTarget(source, target),
    translationMode: readEnum(
      record.translationMode,
      TRANSLATION_MODES,
      DEFAULT_PREFERENCES.translationMode,
    ),
    theme: readEnum(record.theme, THEMES, DEFAULT_PREFERENCES.theme),
    saveHistory: readBoolean(record.saveHistory, DEFAULT_PREFERENCES.saveHistory),
    speechRate: readSpeechRate(record.speechRate, DEFAULT_PREFERENCES.speechRate),
    onboardingComplete: readBoolean(
      record.onboardingComplete,
      DEFAULT_PREFERENCES.onboardingComplete,
    ),
    // Spread rather than assigned, so an absent selection leaves the keys off
    // entirely instead of writing `undefined` into stored JSON.
    ...readVoice(record),
  };
}

/** Only primitives are written — no state, services or runtime objects. */
export function serializePreferences(preferences: Preferences): string {
  return JSON.stringify({ version: PREFERENCES_VERSION, ...preferences });
}
