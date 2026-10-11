import { Image, View } from 'react-native';

import { FLAG_IMAGES } from '@/constants/flag-images';
import { languageRegion } from '@/constants/language-flags';
import { useTheme } from '@/hooks';
import type { LanguageId } from '@/types';

import { Icon } from './icon';

export type FlagCircleProps = {
  language: LanguageId;
  /** Diameter in points. */
  size?: number;
};

/**
 * A language's representative flag, cropped to a circle.
 *
 * A bundled image, scaled to cover the circle and centred, so the crop is the
 * same on every phone — the emoji flags this replaced were drawn differently
 * by every manufacturer's font and never sat straight. A language with no
 * sensible flag (and detect-language) gets a globe instead.
 *
 * Decorative: the language's name always sits beside it.
 */
export function FlagCircle({ language, size = 32 }: FlagCircleProps) {
  const theme = useTheme();
  const region = languageRegion(language);
  const source = region ? FLAG_IMAGES[region] : undefined;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.colors.surfaceMuted,
        // A hairline ring, so a mostly white flag (Japan, Finland) still
        // reads as a circle against a white page.
        borderWidth: theme.layout.borderWidth,
        borderColor: theme.colors.border,
      }}
    >
      {source ? (
        <Image source={source} resizeMode="cover" style={{ width: size, height: size }} />
      ) : (
        <Icon name="globe-outline" size={size * 0.6} color="primary" />
      )}
    </View>
  );
}
