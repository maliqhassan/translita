import { Image } from 'react-native';

/**
 * The Translita mark: a cyan speech bubble with an "A", and a navy bubble
 * with 文 behind it.
 *
 * The same artwork as the launcher icon, generated from the one master by
 * `scripts/generate-icons.mjs` — trimmed to its own edges, on a transparent
 * background, with the original black turned to the app's navy. It therefore
 * sits directly on the page with no tile behind it, and the app and its icon
 * can never drift apart.
 */

const LOGO = require('../../../../assets/images/logo-mark.png') as number;

/** The artwork's own proportions (240×196), so it never stretches. */
const ASPECT = 240 / 196;

/**
 * One size everywhere, on purpose.
 *
 * It used to take a width, and Home asked for 40 while Camera, History and
 * Settings took the 52 default — so the logo visibly jumped in size on every
 * tab change. With no option there is nothing to disagree about.
 */
const WIDTH = 44;

export function BrandMark() {
  const width = WIDTH;
  return (
    <Image
      source={LOGO}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      resizeMode="contain"
      style={{ width, height: width / ASPECT }}
    />
  );
}
