import type { ReactNode } from 'react';

import { AcademyProvider } from './academy-store';
import { ConversationProvider } from './conversation-store';
import { DatabaseProvider } from './database-store';
import { EntitlementsProvider } from './entitlements-store';
import { LanguageProvider } from './language-store';
import { NetworkProvider } from './network-store';
import { PreferencesProvider } from './preferences-store';
import { SavedPhrasesProvider } from './saved-phrases-store';

/**
 * Single composition point for global providers. New stores are added here so
 * the root layout never grows a provider pyramid.
 *
 * `DatabaseProvider` is outermost but does not gate rendering: it reports
 * readiness, and only the screens that need history wait on it.
 *
 * `EntitlementsProvider` does not gate rendering either. It hydrates in the
 * background and starts on the Free default, which grants nothing, so an
 * un-hydrated moment can never hand out a paid feature.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <DatabaseProvider>
      <NetworkProvider>
        <PreferencesProvider>
          <EntitlementsProvider>
            <LanguageProvider>
              <ConversationProvider>
                <SavedPhrasesProvider>
                  <AcademyProvider>{children}</AcademyProvider>
                </SavedPhrasesProvider>
              </ConversationProvider>
            </LanguageProvider>
          </EntitlementsProvider>
        </PreferencesProvider>
      </NetworkProvider>
    </DatabaseProvider>
  );
}
