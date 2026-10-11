import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';

import type { ShadowToken, SpacingToken } from '@/constants';
import { useTheme } from '@/hooks';

export type CardVariant = 'elevated' | 'outlined' | 'filled' | 'glass';

export type CardProps = {
  children: ReactNode;
  variant?: CardVariant;
  padding?: SpacingToken;
  elevation?: ShadowToken;
  style?: ViewStyle;
};

/** Surface primitive. Every panel in the app is a Card so radii stay consistent. */
export function Card({
  children,
  variant = 'elevated',
  padding = 'base',
  elevation = 'sm',
  style,
}: CardProps) {
  const theme = useTheme();

  const variants: Record<CardVariant, ViewStyle> = {
    elevated: {
      backgroundColor: theme.colors.surface,
      ...theme.shadows[elevation],
      shadowColor: theme.colors.shadow,
    },
    outlined: {
      backgroundColor: theme.colors.surface,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.border,
    },
    filled: { backgroundColor: theme.colors.surfaceMuted },
    // The soft white card of the redesigned screens. Always opaque: see the
    // `glass` colour token for why a translucent face cannot carry a shadow.
    glass: {
      backgroundColor: theme.colors.surface,
      borderWidth: theme.layout.borderWidth,
      borderColor: theme.colors.glassBorder,
      ...theme.shadows[elevation],
      shadowColor: theme.colors.shadow,
    },
  };

  const radius = variant === 'glass' ? theme.radius.xl : theme.radius.lg;
  const bordered = variant === 'glass' || variant === 'outlined';

  return (
    <View
      style={[{ borderRadius: radius, padding: theme.spacing[padding] }, variants[variant], style]}
    >
      {padding === 'none' ? (
        /*
         * Rows that run edge to edge — a settings list, say — draw their own
         * pressed highlight, which was a hard rectangle poking out past the
         * card's rounded corners. This inner layer clips them to the card's
         * shape. It is a layer of its own, rather than clipping the card,
         * because clipping the card would also cut off its shadow.
         */
        <View
          style={{
            borderRadius: bordered ? radius - theme.layout.borderWidth : radius,
            overflow: 'hidden',
          }}
        >
          {children}
        </View>
      ) : (
        children
      )}
    </View>
  );
}
