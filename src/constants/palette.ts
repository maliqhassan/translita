/**
 * Raw colour scales. These are the only place literal colour values live.
 * Never reference the palette directly from a component — use the semantic
 * theme tokens exposed by `useTheme()` instead, so light/dark both work.
 */

export const palette = {
  /**
   * Brand — the cyan of the app logo, sampled from it rather than guessed.
   *
   * `400` is the logo's own colour, #0CC0DF. Like the sky blue it replaced it
   * is a *fill*, not an ink: white on it is 2.18:1 and unreadable, while black
   * is 9.62:1. Anything that has to be read as text or an icon therefore uses
   * `700`, which is 5.97:1 on the app background.
   */
  brand: {
    50: '#E8FAFE',
    100: '#C8F2FA',
    200: '#97E7F5',
    300: '#57D6EC',
    /** The logo colour. */
    400: '#0CC0DF',
    500: '#0AA8C4',
    600: '#0990A7',
    /** Brand ink: 5.97:1 on the app background, so text and icons use this. */
    700: '#07697A',
    800: '#06606F',
    900: '#0A4E5B',
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
  green: { 100: '#DCF7E3', 500: '#1CA45B', 600: '#15854A' },
  amber: { 100: '#FDF0D5', 500: '#D98E12', 600: '#B4730B' },
  red: { 100: '#FDE4E4', 500: '#DB4545', 600: '#B93636' },
} as const;
