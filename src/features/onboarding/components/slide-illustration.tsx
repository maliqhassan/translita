import { View } from 'react-native';

import { Icon, type IconName } from '@/components';
import { useTheme } from '@/hooks';

/**
 * The visual on a carousel slide: an icon on a white badge, inside the same
 * ring and pale-blue disc the welcome screen uses.
 *
 * Deliberately one shape repeated with a different glyph, rather than five
 * bespoke pictures. Five hand-built illustrations would be five things to keep
 * in step with the palette, and the reference design's artwork is not
 * something that can be honestly approximated out of rounded views — trying
 * would land somewhere between the two and look like neither.
 *
 * Repeating the shape is also what ties the carousel to the welcome screen it
 * follows, so the two read as one sequence rather than two designs. Both are
 * light: the brand's palest tints on the white page, with the cyan kept for
 * the icon itself.
 *
 * The icon comes from Ionicons, which is the only icon set in the project, so
 * nothing is added to draw these.
 */
export function SlideIllustration({ icon, size }: { icon: IconName; size: number }) {
  const theme = useTheme();

  const badge = size * 0.46;

  return (
    <View
      style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}
      // The heading beside it says what the slide is about, so the picture is
      // decoration and is hidden from a screen reader rather than announced
      // as a second, vaguer version of the same thing.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
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

      <View
        style={{
          width: badge,
          height: badge,
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
        <Icon name={icon} size={Math.round(badge * 0.46)} color="primary" />
      </View>
    </View>
  );
}
