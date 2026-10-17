import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { DEFAULT_PREFERENCES, publishActivePreferences, services } from '@/services';
import type { AppError, BooleanPreference, Preferences } from '@/types';

/**
 * The user's persisted settings.
 *
 * The store is the runtime source of truth; storage is only where it is kept
 * between launches. Every change is applied in memory first and written
 * through afterwards, so a slow or failing write never makes the UI feel
 * stuck or lose what the user just chose.
 */

export type PreferencesContextValue = {
  preferences: Preferences;
  /** Merges a partial change, then persists the whole object. */
  update: (change: Partial<Preferences>) => void;
  toggle: (key: BooleanPreference) => void;
  /** Restores the documented defaults and persists them. */
  reset: () => void;
  /** Set when the last write failed; cleared on the next successful one. */
  saveError?: AppError;
};

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

/**
 * Hydrates from storage before rendering anything.
 *
 * Children stay unmounted until preferences are loaded, which keeps the splash
 * screen up for that moment instead of showing the app with default languages
 * and then visibly correcting itself. Loading always resolves — unreadable
 * storage yields defaults — so this can never strand the launch.
 */
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState<Preferences | null>(null);
  const [saveError, setSaveError] = useState<AppError | undefined>(undefined);

  useEffect(() => {
    let active = true;

    void services.preferences.load().then((loaded) => {
      if (!active) return;
      // Publish before the first render so the router sees the real mode on
      // the very first translation.
      publishActivePreferences(loaded);
      setPreferences(loaded);
    });

    return () => {
      active = false;
    };
  }, []);

  // The app language, attached to every event so uninstalls split by it.
  const appLanguage = preferences?.appLanguage;
  useEffect(() => {
    if (appLanguage)
      services.analytics.setUserProperty({ name: 'app_language', value: appLanguage });
  }, [appLanguage]);

  const value = useMemo<PreferencesContextValue>(() => {
    const current = preferences ?? DEFAULT_PREFERENCES;

    const commit = (next: Preferences) => {
      setPreferences(next);
      publishActivePreferences(next);

      void services.preferences.save(next).then((result) => {
        // The change stays applied either way; the user is only told that it
        // will not survive a restart.
        setSaveError(result.ok ? undefined : result.error);
      });
    };

    return {
      preferences: current,
      saveError,
      update: (change) => commit({ ...current, ...change }),
      toggle: (key) => commit({ ...current, [key]: !current[key] }),
      reset: () => {
        setPreferences({ ...DEFAULT_PREFERENCES });
        publishActivePreferences({ ...DEFAULT_PREFERENCES });
        void services.preferences.reset().then((result) => {
          setSaveError(result.ok ? undefined : result.error);
        });
      },
    };
  }, [preferences, saveError]);

  // Nothing renders until the first load resolves.
  if (!preferences) return null;

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) {
    throw new Error('usePreferences must be used inside <PreferencesProvider>.');
  }
  return context;
}
