/**
 * Raw colour scales. These are the only place literal colour values live.
 * Never reference the palette directly from a component — use the semantic
 * theme tokens exposed by `useTheme()` instead, so light/dark both work.
 */

export const palette = {
  /**
   * Brand — a bright sky blue built around #70D6FF.
   *
   * The requested colour is `400`, and it is deliberately light. That makes it
   * excellent as a *fill* with dark text on it (about 11.5:1) and unusable as
   * text on a white surface (about 1.6:1, where 4.5:1 is the floor). The scale
   * therefore carries a darker shade of the same hue at `700` for anything
   * that has to be read as text or an icon.
   */
  indigo: {
    50: '#EAF8FF',
    100: '#D2F0FF',
    200: '#B0E6FF',
    300: '#8FDCFF',
    /** The requested brand colour. */
    400: '#70D6FF',
    500: '#38BDF0',
    600: '#0EA5D9',
    /** Brand ink: 4.95:1 on the app background, so text and icons use this. */
    700: '#0A749C',
    800: '#0A6386',
    900: '#0A4E6B',
  },
  /** Accent — teal, reserved for offline/ready affordances. */
  teal: {
    50: '#E6FAF7',
    100: '#C4F3EC',
    300: '#68DCCC',
    500: '#18B79F',
    600: '#0E937F',
    700: '#0C7566',
  },
  /** Neutrals — slightly cool greys so surfaces read as "paper", not concrete. */
  neutral: {
    0: '#FFFFFF',
    50: '#F7F8FA',
    100: '#F0F2F5',
    200: '#E3E6EC',
    300: '#CDD2DB',
    400: '#9BA3B2',
    500: '#6E7787',
    600: '#525A69',
    700: '#3B4250',
    800: '#252B36',
    850: '#1B202A',
    900: '#14181F',
    950: '#0B0C10',
  },
  /**
   * Mint — the welcome screen, and only the welcome screen.
   *
   * A second brand-weight colour is normally a mistake, so this one is fenced
   * in: it is used by the onboarding tokens below and by nothing else. The
   * app proper stays on the sky-blue brand. `500` is the field colour; `600`
   * is dark enough (about 4.6:1 on white) to be read as text on the white
   * button that sits on top of it.
   */
  mint: { 100: '#D8F5E8', 400: '#5BD3A0', 500: '#3FBF8B', 600: '#2E8F68', 700: '#236B4E' },
  green: { 100: '#DCF7E3', 500: '#1CA45B', 600: '#15854A' },
  amber: { 100: '#FDF0D5', 500: '#D98E12', 600: '#B4730B' },
  red: { 100: '#FDE4E4', 500: '#DB4545', 600: '#B93636' },
} as const;
