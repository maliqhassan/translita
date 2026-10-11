import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAppLanguage } from '@/i18n';

/**
 * Brings the user back to Settings after they change the app's language.
 *
 * The navigator is remounted for a new language so every screen redraws in
 * it, and a fresh navigator starts on Home. The language is only changed from
 * Settings, so that is where the user expects to be. Renders nothing; it sits
 * outside the remounted navigator so it remembers the language it last saw.
 *
 * It waits for the new navigator's state — a different root key — before
 * navigating, because an action sent while the old one is being torn down
 * has nowhere to go.
 */
export function ReturnToSettingsOnLanguageChange(): null {
  const router = useRouter();
  const language = useAppLanguage();
  const rootKey = useRootNavigationState()?.key;
  const seen = useRef({ language, rootKey });

  useEffect(() => {
    if (seen.current.language === language) {
      seen.current.rootKey = rootKey;
      return;
    }
    if (!rootKey || rootKey === seen.current.rootKey) return;
    seen.current = { language, rootKey };
    router.navigate('/settings');
  }, [language, rootKey, router]);

  return null;
}
