import type { IconName } from '@/components';
import { LANGUAGES } from '@/constants';

/**
 * What the carousel says, and why each line is allowed to be said.
 *
 * Onboarding is the one place in an app where it is easiest to overpromise and
 * hardest to notice: nobody is looking at the feature while they read about
 * it. So every slide here names the code that makes it true, and a test asserts
 * the forbidden claims are absent rather than trusting this comment.
 *
 * Three things are deliberately not claimed:
 *
 *   - That every language works offline. None does by default — every
 *     catalogue entry reports `offline.supported: false`, and a language
 *     becomes available on-device only when the installed runtime says so and
 *     a pack has been downloaded for it.
 *   - That dictation is private or on-device. On most Android phones the
 *     platform recogniser streams audio to Google.
 *   - That the camera reads any script. The bundled ML Kit model is Latin
 *     only, which is the trade for it needing no download.
 *
 * Copy lives in the feature rather than in `src/constants`, because constants
 * may not import from the service layer — the same rule `pro-benefits` follows.
 */

export type OnboardingSlide = {
  key: string;
  icon: IconName;
  heading: string;
  body: string;
};

/**
 * Read from the catalogue rather than written down.
 *
 * A number typed into copy is a number that goes stale the first time a
 * language is added, and onboarding is the last place anyone would think to
 * check. Deriving it means the sentence cannot become untrue.
 */
const languageCount = LANGUAGES.length;

export const ONBOARDING_SLIDES: readonly OnboardingSlide[] = [
  {
    key: 'routing',
    icon: 'swap-horizontal-outline',
    heading: 'Online or offline',
    // Verified in `routing-policy.ts`: `orderEngines` ranks the online engine
    // first when a connection is reported and the on-device engine first when
    // it is not, in the default `auto` mode.
    body: 'Translita translates over the internet when you have a connection, and switches to on-device translation when you do not.',
  },
  {
    key: 'text',
    icon: 'language-outline',
    heading: `${languageCount} languages`,
    // Verified in `language-catalog.ts` and `languages.ts`: the catalogue is
    // the authoritative list, and `SOURCE_LANGUAGES` prepends auto-detect.
    body: 'Type or paste text, pick a pair from the catalogue, and let Translita detect the source language if you are not sure.',
  },
  {
    key: 'speech',
    icon: 'mic-outline',
    // Verified: `FEATURES.speechInput` and `FEATURES.textToSpeech` are both
    // on, with voice and speed settings under Settings. Hedged because both
    // depend on the platform: a device with no recogniser hides the control
    // rather than failing at it.
    heading: 'Speak and listen',
    body: 'Dictate instead of typing, and hear translations read aloud. Choose the voice and speed in Settings, on supported devices.',
  },
  {
    key: 'camera',
    icon: 'camera-outline',
    // Verified in the native OCR module under `modules/transee-mlkit` and in
    // `mlkit-ocr-service.ts`. Note the module's class name is deliberately not
    // written out here: a structural test scans `src` for it to prove no
    // feature file reaches past the service, and a mention in a comment is
    // enough to trip it. The bundled recognition model ships inside the APK,
    // so it needs no download and no network — and reads Latin script only.
    heading: 'Scan with the camera',
    body: 'Point the camera at printed Latin-script text. Recognition runs on your device, with no connection needed, on supported devices.',
  },
  {
    key: 'packs',
    icon: 'cloud-download-outline',
    // Verified against the language-packs screen and `model-registry.ts`. A
    // pack is one language, not one pair, which is why both sides have to be
    // downloaded — stated plainly here because it surprises people otherwise.
    heading: 'Download language packs',
    body: 'Save the languages you need for offline use. A pack covers one language, so download both sides of a pair to translate without a connection.',
  },
];
