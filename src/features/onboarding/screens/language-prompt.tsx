import { useEffect, useState } from 'react';

import { deviceAppLanguage } from '@/i18n';
import { usePreferences } from '@/store';

import { LanguageSelectScreen } from './language-select-screen';

/**
 * The language question, asked once of someone who used the app before it
 * spoke other languages.
 *
 * It opens on the phone's own language, so the question itself reads in it
 * and Continue is one tap. Closing it puts back the language they had. Either
 * way it is answered, and the root never shows it again.
 *
 * One write per answer: preference updates build on the values of the render
 * they were made in, so two in a row would overwrite each other.
 */
export function LanguagePrompt() {
  const { preferences, update } = usePreferences();
  const [previous] = useState(preferences.appLanguage);

  useEffect(() => {
    update({ appLanguage: deviceAppLanguage() });
    // Once, on arrival: after this, the user's taps decide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <LanguageSelectScreen
      onContinue={() => update({ appLanguageChosen: true })}
      onClose={() => update({ appLanguage: previous, appLanguageChosen: true })}
    />
  );
}
