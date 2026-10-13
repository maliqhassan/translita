import { msg } from '@/i18n';

/**
 * Fabalita, the AI Academy's coach: Translita's worldly sister.
 *
 * Her name is a name, so it is never translated; text that mentions her takes
 * it as `{name}`, which keeps every translation pointing at the same person.
 */
export const FABALITA = {
  name: 'Fabalita',
  /** Her face, on a clear background: drawn inside the coach's circle. */
  image: require('../../../assets/images/fabalita.png') as number,
  /** Her face on the brand blue, as an icon: the certificate's seal. */
  icon: require('../../../assets/images/fabalita-icon.png') as number,
  tagline: msg('Your pocket guide to speaking like a true local'),
} as const;
