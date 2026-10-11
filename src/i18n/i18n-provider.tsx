import { createContext, useContext, type ReactNode } from 'react';

import { setAppLanguage } from './i18n';
import type { AppLanguageCode } from './languages';

const LanguageContext = createContext<AppLanguageCode>('en');

/**
 * Sets the app's language before anything under it renders.
 *
 * Set during render rather than in an effect, so the very first frame is
 * already in the right language. Components that need to redraw when it
 * changes without being remounted — the onboarding screens, where the choice
 * is made — read it with `useAppLanguage`.
 */
export function I18nProvider({
  language,
  children,
}: {
  language: AppLanguageCode;
  children: ReactNode;
}) {
  setAppLanguage(language);
  return <LanguageContext.Provider value={language}>{children}</LanguageContext.Provider>;
}

/** The current app language, and a redraw whenever it changes. */
export function useAppLanguage(): AppLanguageCode {
  return useContext(LanguageContext);
}
