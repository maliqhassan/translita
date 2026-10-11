import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { resolveInk, type ColorTokens, type TextVariant } from '@/constants';
import { useTheme } from '@/hooks';
import { isRtl } from '@/i18n';

/** Colour token keys that make sense for text. */
export type TextColor = Extract<
  keyof ColorTokens,
  | 'text'
  | 'textSecondary'
  | 'textMuted'
  | 'textOnPrimary'
  | 'primary'
  /** The brand's ink: readable as text on white and on the pale-blue tint. */
  | 'primaryStrong'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'onCamera'
  | 'onCameraMuted'
  | 'onGradient'
  | 'onGradientMuted'
  | 'tabBarActive'
  | 'tabBarInactive'
>;

export type TextProps = RNTextProps & {
  variant?: TextVariant;
  color?: TextColor;
  align?: TextStyle['textAlign'];
};

/**
 * Typography primitive. Screens should never set `fontSize` directly — add a
 * variant in `constants/typography.ts` instead.
 *
 * In Urdu or Arabic the app's own words run right to left. The layout around
 * them stays as it is — a deliberate choice, so icons and controls keep their
 * places. What the user typed and its translation keep their own direction,
 * whatever language the app is in.
 */
export function Text({ variant = 'body', color = 'text', align, style, ...rest }: TextProps) {
  const theme = useTheme();
  const userText = variant === 'sourceText' || variant === 'translatedText';
  return (
    <RNText
      style={[
        theme.typography.variants[variant],
        {
          color: resolveInk(theme, color),
          textAlign: align,
          writingDirection: isRtl() && !userText ? 'rtl' : undefined,
        },
        style,
      ]}
      {...rest}
    />
  );
}
