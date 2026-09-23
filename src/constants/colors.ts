import { palette } from './palette';

/**
 * Semantic colour tokens. Both themes implement the exact same key set, so a
 * component can be written once and stay correct in light and dark.
 */
export type ColorTokens = {
  /** Furthest-back app surface. */
  background: string;
  /** Cards, sheets and anything lifted off the background. */
  surface: string;
  /** Quieter fills: input backgrounds, chips, pressed rows. */
  surfaceMuted: string;
  /** Strongest fill, used for the translation result panel. */
  surfaceStrong: string;

  border: string;
  borderStrong: string;

  text: string;
  textSecondary: string;
  textMuted: string;
  /** Text drawn on top of `primary` / other strong fills. */
  textOnPrimary: string;

  primary: string;
  primaryPressed: string;
  primaryMuted: string;
  primaryBorder: string;
  /**
   * Brand ink — the same hue as `primary`, dark enough to read.
   *
   * `primary` is a light sky blue chosen for fills, where dark text sits on
   * top of it. As text on the app background it would be illegible, so every
   * brand-coloured word and glyph uses this instead.
   */
  primaryStrong: string;

  accent: string;
  accentMuted: string;

  success: string;
  successMuted: string;
  warning: string;
  warningMuted: string;
  danger: string;
  dangerMuted: string;

  /** Backdrop behind modals and full-screen loaders. */
  overlay: string;
  /**
   * The header gradient, and what is legible on top of it.
   *
   * Two stops rather than one flat bar: the header is the only large block of
   * brand colour in the app, and a gentle fall from a deeper to a lighter blue
   * gives it depth without any imagery. Painted with the platform's own
   * gradient support, so no drawing library is involved.
   */
  gradientFrom: string;
  gradientTo: string;
  onGradient: string;
  onGradientMuted: string;
  /**
   * A raised chip sitting *on* the gradient.
   *
   * Separate from `onGradientMuted`, which is a muted **text** colour. Using
   * that as a surface is what turned the brand tile into a dark square: on the
   * light gradient the muted ink is dark, and a dark ink makes a dark tile.
   */
  onGradientSurface: string;

  /**
   * The camera surface, and what sits on top of it.
   *
   * Identical in both themes on purpose: behind these is a live camera feed,
   * not the app's background, so they do not follow the app's light or dark
   * setting. Tokens rather than literals so the exception is declared once
   * here instead of being scattered through a screen.
   */
  cameraSurface: string;
  onCamera: string;
  onCameraMuted: string;
  /** Skeleton / shimmer base. */
  skeleton: string;
  shadow: string;

  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;

  /**
   * The welcome screen: a full-bleed field of colour with content on top.
   *
   * Its own tokens rather than the gradient ones because it is deliberately a
   * different colour from the rest of the app — a mint field, where the app
   * proper is sky blue. Declaring that exception here is what keeps it out of
   * the component, which still styles itself entirely through the theme.
   *
   * It barely shifts between light and dark. The screen is a solid field of
   * brand colour either way, so following the scheme would only make the
   * first thing a user sees look like two different products.
   */
  onboarding: string;
  onOnboarding: string;
  onOnboardingMuted: string;
  /** The primary action sitting on that field, and the ink on it. */
  onboardingAction: string;
  onOnboardingAction: string;
};

export const lightColors: ColorTokens = {
  background: palette.neutral[50],
  surface: palette.neutral[0],
  surfaceMuted: palette.neutral[100],
  surfaceStrong: palette.neutral[200],

  border: palette.neutral[200],
  borderStrong: palette.neutral[300],

  text: palette.neutral[900],
  textSecondary: palette.neutral[600],
  textMuted: palette.neutral[400],
  textOnPrimary: palette.neutral[900],

  primary: palette.indigo[400],
  primaryPressed: palette.indigo[500],
  primaryMuted: palette.indigo[50],
  primaryBorder: palette.indigo[200],
  primaryStrong: palette.indigo[700],

  accent: palette.teal[600],
  accentMuted: palette.teal[50],

  success: palette.green[600],
  successMuted: palette.green[100],
  warning: palette.amber[600],
  warningMuted: palette.amber[100],
  danger: palette.red[600],
  dangerMuted: palette.red[100],

  overlay: 'rgba(11, 12, 16, 0.45)',
  onboarding: palette.mint[500],
  // White on this mint is about 3.1:1 — short of 4.5:1 for body text, which
  // is why the title is display-sized and the muted line is only a shade
  // under white rather than the usual heavy fade.
  onOnboarding: '#FFFFFF',
  onOnboardingMuted: 'rgba(255, 255, 255, 0.92)',
  onboardingAction: palette.neutral[0],
  onOnboardingAction: palette.mint[600],
  gradientFrom: palette.indigo[500],
  gradientTo: palette.indigo[300],
  // Dark ink, not white: white on this blue is about 1.6:1 and unreadable.
  onGradient: palette.neutral[900],
  onGradientMuted: 'rgba(10, 78, 107, 0.72)',
  onGradientSurface: 'rgba(255, 255, 255, 0.7)',
  cameraSurface: '#000000',
  onCamera: '#FFFFFF',
  onCameraMuted: 'rgba(255, 255, 255, 0.4)',
  skeleton: palette.neutral[200],
  shadow: '#0B0C10',

  tabBar: palette.neutral[0],
  tabBarBorder: palette.neutral[200],
  tabBarActive: palette.indigo[700],
  tabBarInactive: palette.neutral[600],
};

export const darkColors: ColorTokens = {
  background: palette.neutral[950],
  surface: palette.neutral[900],
  surfaceMuted: palette.neutral[850],
  surfaceStrong: palette.neutral[800],

  border: palette.neutral[800],
  borderStrong: palette.neutral[700],

  text: palette.neutral[50],
  textSecondary: palette.neutral[400],
  textMuted: palette.neutral[500],
  textOnPrimary: palette.neutral[900],

  primary: palette.indigo[400],
  primaryPressed: palette.indigo[300],
  primaryStrong: palette.indigo[300],
  primaryMuted: 'rgba(124, 131, 241, 0.14)',
  primaryBorder: 'rgba(124, 131, 241, 0.32)',

  accent: palette.teal[300],
  accentMuted: 'rgba(104, 220, 204, 0.14)',

  success: palette.green[500],
  successMuted: 'rgba(28, 164, 91, 0.16)',
  warning: palette.amber[500],
  warningMuted: 'rgba(217, 142, 18, 0.16)',
  danger: palette.red[500],
  dangerMuted: 'rgba(219, 69, 69, 0.16)',

  overlay: 'rgba(0, 0, 0, 0.6)',
  // A shade deeper than light mode, and no more: this is a brand field, not
  // a surface, so it does not invert.
  onboarding: palette.mint[600],
  onOnboarding: '#FFFFFF',
  onOnboardingMuted: 'rgba(255, 255, 255, 0.92)',
  onboardingAction: palette.neutral[0],
  onOnboardingAction: palette.mint[700],
  gradientFrom: palette.indigo[800],
  gradientTo: palette.indigo[700],
  // Deep enough here that white is the readable choice.
  onGradient: '#FFFFFF',
  onGradientMuted: 'rgba(255, 255, 255, 0.72)',
  onGradientSurface: 'rgba(255, 255, 255, 0.16)',
  cameraSurface: '#000000',
  onCamera: '#FFFFFF',
  onCameraMuted: 'rgba(255, 255, 255, 0.4)',
  skeleton: palette.neutral[800],
  shadow: '#000000',

  tabBar: palette.neutral[900],
  tabBarBorder: palette.neutral[800],
  tabBarActive: palette.indigo[300],
  tabBarInactive: palette.neutral[500],
};
