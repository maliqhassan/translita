import type { LanguageId } from './language';

/**
 * How the user wants translations routed.
 *
 * This is a *preference*, not a claim about what exists. `offline` says which
 * engine the user wants tried; whether one is installed is the router's
 * question, and it answers honestly rather than quietly using the other one.
 */
export type TranslationMode = 'auto' | 'online' | 'offline';

export type ThemePreference = 'system' | 'light' | 'dark';

/**
 * Everything the app remembers between launches.
 *
 * Deliberately small: every field here changes real behaviour today. Settings
 * for capabilities that do not exist yet (text to speech, language pack
 * downloads) are added on the day those capabilities land, so the screen never
 * offers a switch that does nothing.
 */
export type Preferences = {
  /**
   * The translation pair. The language store is the runtime source of truth;
   * these are the values it hydrates from and writes back to.
   *
   * `auto` as a source is how auto-detection is expressed — there is no
   * separate flag, because that would be the same fact stored twice.
   */
  sourceLanguage: LanguageId;
  targetLanguage: LanguageId;
  translationMode: TranslationMode;
  theme: ThemePreference;
  /** Save completed translations to the on-device history. */
  saveHistory: boolean;
  /**
   * How fast a translation is read aloud, where 1 is the engine's natural
   * pace. Only the documented steps are accepted; anything else reads as 1.
   */
  speechRate: SpeechRate;
  /**
   * The voice chosen for reading translations aloud, if any.
   *
   * Undefined means the platform picks, which is what every install starts
   * with and what the whole feature degrades to when anything is unusable.
   */
  voiceId?: string;
  /**
   * The target language the voice above was chosen for.
   *
   * Voices are language-specific: a German voice reading French is worse than
   * no choice at all. Storing the language alongside the id is what lets the
   * selection be applied only where it belongs, and kept — rather than
   * deleted — while the user is translating into something else.
   */
  voiceLanguage?: LanguageId;
  /**
   * Whether the welcome screen has been got past.
   *
   * A preference rather than a slot of its own, because it is genuinely a
   * per-install setting and the preferences file is already the place the app
   * remembers per-install things. It is deliberately not something the user
   * can toggle in Settings: there is nothing to choose, only something that
   * has or has not happened.
   *
   * False by default, so a fresh install is shown the welcome screen. An
   * install that predates the field is migrated to true — see
   * `preferences-schema`, where the reasoning lives.
   */
  onboardingComplete: boolean;
  /**
   * AI practice exchanges used against the free allowance.
   *
   * Counted here rather than on a server because there is no account to count
   * against: the app has no sign-in, deliberately. That makes this an honest
   * allowance rather than an enforceable quota — reinstalling resets it, and
   * nothing pretends otherwise.
   *
   * It is enough for what it is for. The allowance exists so somebody can
   * find out whether they like practising before paying, not to stop a
   * determined person reinstalling. The cost of that is a few tenths of a
   * penny; the cost of demanding an account to prevent it is the whole
   * no-sign-in promise.
   */
  aiTurnsUsed: number;
};

/**
 * The speech rates offered, slowest first.
 *
 * Capped at 1.5 rather than the engine's 2.0: this exists for someone
 * following along in a language they are learning, and 2× is not followable.
 */
export const SPEECH_RATES = [0.5, 0.75, 1, 1.25, 1.5] as const;

export type SpeechRate = (typeof SPEECH_RATES)[number];

/**
 * Preference keys whose value is a boolean, so toggles stay type-safe.
 *
 * `-?` strips the optional modifier before the check. Without it an optional
 * key keeps its own optionality in the mapped type, which puts `undefined`
 * into the union and lets it be used where a key is expected.
 */
export type BooleanPreference = {
  [K in keyof Preferences]-?: Preferences[K] extends boolean ? K : never;
}[keyof Preferences];
