import { View, type ViewStyle } from 'react-native';

import { Text } from '@/components';
import { useTheme } from '@/hooks';

/**
 * The welcome screen's artwork: a globe with translation bubbles around it.
 *
 * Drawn out of plain views rather than shipped as an image or an SVG. The
 * shapes are circles and rounded squares, which borderRadius already gives us,
 * so an asset would be a file to export, scale for three densities and keep in
 * step with the theme — for a picture that is three rounded rectangles. Adding
 * a vector library for it would be worse still.
 *
 * It also means the artwork is themed rather than baked: the bubbles use the
 * same semantic colours as the rest of the app, so it cannot drift out of step
 * with the palette the way a PNG would.
 *
 * Sized from a single `size` prop so the caller can shrink it on a short
 * screen without every offset inside needing to be recalculated.
 */

type BubbleProps = {
  glyph: string;
  background: string;
  ink: string;
  size: number;
  radius: number;
  position: Pick<ViewStyle, 'top' | 'bottom' | 'left' | 'right'>;
};

/**
 * A rounded square with a glyph in it, placed around the globe.
 *
 * Declared at module level rather than inside the illustration: a component
 * defined during render is a new type on every render, which remounts it and
 * throws away its state. There is no state here to lose, but the rule is
 * worth keeping because the day one is added the bug is invisible.
 */
function Bubble({ glyph, background, ink, size, radius, position }: BubbleProps) {
  return (
    <View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: radius,
        backgroundColor: background,
        ...position,
      }}
    >
      <Text
        style={{ color: ink, fontSize: size * 0.44, fontWeight: '700' }}
        // The glyphs are decoration; the heading underneath says what the
        // screen is. Letting them scale with the system font would push them
        // out of their bubbles for no gain.
        allowFontScaling={false}
      >
        {glyph}
      </Text>
    </View>
  );
}

export function WelcomeIllustration({ size }: { size: number }) {
  const theme = useTheme();

  /** The globe sits inside the outer rings, not flush with them. */
  const globe = size * 0.56;
  const bubble = size * 0.26;

  const ring = (diameter: number, opacity: number) => ({
    position: 'absolute' as const,
    width: diameter,
    height: diameter,
    borderRadius: theme.radius.full,
    borderWidth: 1,
    borderColor: theme.colors.onOnboardingMuted,
    opacity,
  });

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      // One label for the whole picture, so a screen reader announces it once
      // instead of reading out three decorative letters.
      accessible
      accessibilityRole="image"
      accessibilityLabel="A globe surrounded by speech bubbles in different scripts"
    >
      {/* Two faint rings, as in the reference: they give the field depth
          without adding another colour. */}
      <View style={ring(size, 0.35)} />
      <View style={ring(size * 0.82, 0.55)} />

      <View
        style={{
          width: globe,
          height: globe,
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.onboardingAction,
          opacity: 0.22,
        }}
      />

      <Bubble
        glyph="A"
        background={theme.colors.danger}
        ink={theme.colors.onboardingAction}
        size={bubble}
        radius={theme.radius.lg}
        position={{ left: 0, top: size * 0.3 }}
      />
      <Bubble
        glyph="文"
        background={theme.colors.warning}
        ink={theme.colors.onboardingAction}
        size={bubble}
        radius={theme.radius.lg}
        position={{ bottom: size * 0.2, right: size * 0.2 }}
      />
      <Bubble
        glyph="あ"
        background={theme.colors.onboardingAction}
        ink={theme.colors.onOnboardingAction}
        size={bubble}
        radius={theme.radius.lg}
        position={{ right: 0, top: size * 0.14 }}
      />
    </View>
  );
}
