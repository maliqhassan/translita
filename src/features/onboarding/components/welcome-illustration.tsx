import { View, type ViewStyle } from 'react-native';

import { Icon, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

/**
 * The welcome screen's artwork: a globe with speech bubbles around it.
 *
 * Drawn out of plain views rather than shipped as an image or an SVG. The
 * shapes are circles and rounded squares, which borderRadius already gives us,
 * so an asset would be a file to export, scale for three densities and keep in
 * step with the theme — for a picture that is three rounded rectangles. Adding
 * a vector library for it would be worse still.
 *
 * Light on purpose: a pale-blue disc on the white page, a white globe badge,
 * and bubbles in the logo's own two colours — the cyan and the navy — plus a
 * white one. It used to sit on a full field of brand cyan with red and orange
 * bubbles, which read as heavy and off-palette next to the white app it opens
 * into.
 *
 * Sized from a single `size` prop so the caller can shrink it on a short
 * screen without every offset inside needing to be recalculated.
 */

type Corner = 'topLeft' | 'bottomLeft' | 'bottomRight';

type BubbleProps = {
  glyph: string;
  background: string;
  ink: string;
  size: number;
  /** The corner that points back at the globe, drawn tight like a tail. */
  tail: Corner;
  position: Pick<ViewStyle, 'top' | 'bottom' | 'left' | 'right'>;
  /** A hairline edge, for the white bubble that would otherwise vanish. */
  outlined?: boolean;
};

/**
 * A speech bubble with a glyph in it, placed around the globe.
 *
 * Declared at module level rather than inside the illustration: a component
 * defined during render is a new type on every render, which remounts it and
 * throws away its state. There is no state here to lose, but the rule is
 * worth keeping because the day one is added the bug is invisible.
 */
function Bubble({ glyph, background, ink, size, tail, position, outlined = false }: BubbleProps) {
  const theme = useTheme();
  const corner = (name: Corner) => (tail === name ? theme.radius.sm : theme.radius.lg);

  return (
    <View
      style={{
        position: 'absolute',
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: theme.radius.lg,
        borderTopLeftRadius: corner('topLeft'),
        borderBottomLeftRadius: corner('bottomLeft'),
        borderBottomRightRadius: corner('bottomRight'),
        backgroundColor: background,
        borderWidth: outlined ? theme.layout.borderWidth : 0,
        borderColor: theme.colors.primaryBorder,
        ...theme.shadows.sm,
        shadowColor: theme.colors.shadow,
        ...position,
      }}
    >
      <Text
        style={{ color: ink, fontSize: size * 0.42, fontWeight: '700' }}
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

  const bubble = size * 0.24;
  const globe = size * 0.44;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      // One label for the whole picture, so a screen reader announces it once
      // instead of reading out three decorative letters.
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('A globe surrounded by speech bubbles in different scripts')}
    >
      {/* A faint ring and a pale-blue disc: the brand's lightest tints, so
          the picture stays light and is still unmistakably the brand. */}
      <View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: theme.radius.full,
          borderWidth: theme.layout.borderWidth,
          borderColor: theme.colors.primaryBorder,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: size * 0.8,
          height: size * 0.8,
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.primaryMuted,
        }}
      />

      {/* The globe: a white badge, the one raised thing in the middle. */}
      <View
        style={{
          width: globe,
          height: globe,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.surface,
          borderWidth: theme.layout.borderWidth,
          borderColor: theme.colors.primaryBorder,
          ...theme.shadows.md,
          shadowColor: theme.colors.shadow,
        }}
      >
        <Icon name="globe-outline" size={Math.round(globe * 0.5)} color="primary" />
      </View>

      {/* The logo's two colours, each with its tail towards the globe. */}
      <Bubble
        glyph="A"
        background={theme.colors.primary}
        ink={theme.colors.textOnPrimary}
        size={bubble}
        tail="bottomRight"
        position={{ left: size * 0.02, top: size * 0.2 }}
      />
      <Bubble
        glyph="文"
        background={theme.colors.text}
        ink={theme.colors.background}
        size={bubble}
        tail="bottomLeft"
        position={{ right: size * 0.02, top: size * 0.1 }}
      />
      <Bubble
        glyph="あ"
        background={theme.colors.surface}
        ink={theme.colors.primaryStrong}
        size={bubble}
        tail="topLeft"
        outlined
        position={{ right: size * 0.12, bottom: size * 0.06 }}
      />
    </View>
  );
}
