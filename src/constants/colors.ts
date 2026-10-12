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
  /**
   * The page wash behind the home and settings screens: a soft vertical fall
   * rather than a flat fill, with translucent "glass" cards sitting on it.
   */
  washFrom: string;
  washTo: string;
  glass: string;
  glassBorder: string;
  /** Skeleton / shimmer base. */
  skeleton: string;
  shadow: string;

  /**
   * The AI coach: its gradient, what reads on top of it, and its softer
   * tints. Violet into the brand's deep teal, so it belongs to the app but is
   * never mistaken for the translator. White ink reads on both stops.
   */
  aiFrom: string;
  aiTo: string;
  onAi: string;
  onAiMuted: string;
  /** A chip or track sitting on the AI gradient. */
  aiSurface: string;
  /** The coach's speech and quiet fills on the page. */
  aiMuted: string;
  aiBorder: string;
  /** The coach's ink on the page: its name, its glyphs. */
  aiStrong: string;
  /** The soft pulse behind the coach and the way into it. */
  aiGlow: string;
  /** The streak's flame. */
  flame: string;

  tabBar: string;
  tabBarBorder: string;
  tabBarActive: string;
  tabBarInactive: string;
};

export const lightColors: ColorTokens = {
  // A white page, navy ink and the brand blue as the only colour — the plain,
  // familiar look of a translator. Cards are told apart by a hairline border
  // rather than a tinted page behind them.
  background: palette.neutral[0],
  surface: palette.neutral[0],
  surfaceMuted: palette.sky[50],
  surfaceStrong: palette.sky[200],

  border: palette.sky[200],
  borderStrong: palette.neutral[300],

  text: palette.sky[950],
  textSecondary: palette.sky[600],
  textMuted: palette.sky[450],
  textOnPrimary: palette.neutral[900],

  primary: palette.brand[400],
  primaryPressed: palette.brand[500],
  primaryMuted: palette.brand[50],
  primaryBorder: palette.brand[200],
  primaryStrong: palette.brand[700],

  accent: palette.teal[600],
  accentMuted: palette.teal[50],

  success: palette.green[600],
  successMuted: palette.green[100],
  warning: palette.amber[600],
  warningMuted: palette.amber[100],
  danger: palette.red[600],
  dangerMuted: palette.red[100],

  overlay: 'rgba(11, 12, 16, 0.45)',
  gradientFrom: palette.brand[500],
  gradientTo: palette.brand[300],
  // Dark ink, not white: white on this blue is about 1.6:1 and unreadable.
  onGradient: palette.neutral[900],
  onGradientMuted: 'rgba(10, 78, 91, 0.72)',
  onGradientSurface: 'rgba(255, 255, 255, 0.7)',
  cameraSurface: '#000000',
  onCamera: '#FFFFFF',
  onCameraMuted: 'rgba(255, 255, 255, 0.4)',
  // The wash is white now too, so a screen asking for it matches the rest.
  washFrom: palette.neutral[0],
  washTo: palette.neutral[0],
  // Opaque on purpose. A translucent card with an Android elevation shadow
  // lets the shadow show through its own face, which drew every card as a
  // grey slab with the white content floating inside it.
  glass: palette.neutral[0],
  // Visible on white: the card's edge is its border, not a contrast of fills.
  glassBorder: palette.sky[200],
  skeleton: palette.neutral[200],
  shadow: '#0B0C10',

  aiFrom: palette.violet[600],
  aiTo: palette.brand[700],
  onAi: '#FFFFFF',
  onAiMuted: 'rgba(255, 255, 255, 0.78)',
  aiSurface: 'rgba(255, 255, 255, 0.2)',
  aiMuted: palette.violet[50],
  aiBorder: palette.violet[100],
  aiStrong: palette.violet[700],
  aiGlow: 'rgba(105, 65, 242, 0.32)',
  flame: palette.amber[500],

  tabBar: palette.neutral[0],
  tabBarBorder: palette.sky[200],
  // Cyan, as in the design, at the darkest step that still reads at 3:1 on
  // the white bar — the lighter logo cyan is under that.
  tabBarActive: palette.brand[600],
  tabBarInactive: palette.sky[600],
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

  primary: palette.brand[400],
  primaryPressed: palette.brand[300],
  primaryStrong: palette.brand[300],
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
  gradientFrom: palette.brand[800],
  gradientTo: palette.brand[700],
  // Deep enough here that white is the readable choice.
  onGradient: '#FFFFFF',
  onGradientMuted: 'rgba(255, 255, 255, 0.72)',
  onGradientSurface: 'rgba(255, 255, 255, 0.16)',
  cameraSurface: '#000000',
  onCamera: '#FFFFFF',
  onCameraMuted: 'rgba(255, 255, 255, 0.4)',
  washFrom: palette.neutral[900],
  washTo: palette.neutral[950],
  glass: palette.neutral[850],
  glassBorder: palette.neutral[800],
  skeleton: palette.neutral[800],
  shadow: '#000000',

  aiFrom: palette.violet[700],
  aiTo: palette.brand[800],
  onAi: '#FFFFFF',
  onAiMuted: 'rgba(255, 255, 255, 0.74)',
  aiSurface: 'rgba(255, 255, 255, 0.16)',
  aiMuted: 'rgba(124, 92, 255, 0.16)',
  aiBorder: 'rgba(124, 92, 255, 0.34)',
  aiStrong: palette.violet[300],
  aiGlow: 'rgba(124, 92, 255, 0.4)',
  flame: palette.amber[300],

  tabBar: palette.neutral[900],
  tabBarBorder: palette.neutral[800],
  tabBarActive: palette.brand[300],
  // Every tab now carries a label, so the inactive ink has to read as text.
  tabBarInactive: palette.neutral[400],
};
