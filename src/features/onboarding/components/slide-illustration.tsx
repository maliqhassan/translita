import { View } from 'react-native';

import { Icon, type IconName } from '@/components';
import { useTheme } from '@/hooks';

/**
 * The visual on a carousel slide: an icon inside the same rings the welcome
 * screen uses.
 *
 * Deliberately one shape repeated with a different glyph, rather than five
 * bespoke pictures. Five hand-built illustrations would be five things to keep
 * in step with the palette, and the reference design's artwork is not
 * something that can be honestly approximated out of rounded views — trying
 * would land somewhere between the two and look like neither.
 *
 * Repeating the rings is also what ties the carousel to the welcome screen it
 * follows, so the two read as one sequence rather than two designs.
 *
 * The icon comes from Ionicons, which is the only icon set in the project, so
 * nothing is added to draw these.
 */
export function SlideIllustration({ icon, size }: { icon: IconName; size: number }) {
  const theme = useTheme();

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
      // The heading beside it says what the slide is about, so the picture is
      // decoration and is hidden from a screen reader rather than announced
      // as a second, vaguer version of the same thing.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={ring(size, 0.35)} />
      <View style={ring(size * 0.82, 0.55)} />

      <View
        style={{
          width: size * 0.56,
          height: size * 0.56,
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.onboardingAction,
        }}
      >
        <Icon name={icon} size={size * 0.26} color="onOnboardingAction" />
      </View>
    </View>
  );
}
