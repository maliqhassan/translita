import { View } from 'react-native';

import { Icon } from '@/components';
import { useTheme } from '@/hooks';

export type BrandMarkProps = {
  /**
   * Rendered on the header gradient rather than on the app background.
   *
   * The solid indigo tile disappears against the gradient, so on it the mark
   * becomes a translucent white tile instead. Same glyph, legible on both.
   */
  onGradient?: boolean;
};

/** The small Translita glyph that anchors the home header. */
export function BrandMark({ onGradient = false }: BrandMarkProps) {
  const theme = useTheme();

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 34,
        height: 34,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.md,
        backgroundColor: onGradient ? theme.colors.onGradientSurface : theme.colors.primary,
      }}
    >
      <Icon name="language" size={19} color={onGradient ? 'primary' : 'textOnPrimary'} />
    </View>
  );
}
