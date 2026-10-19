import { usePathname } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Alert } from 'react-native';

import { FABALITA_INVITES } from '@/constants';
import { t } from '@/i18n';
import { services } from '@/services';
import { usePreferences } from '@/store';

import { FABALITA } from '../fabalita';
import { useActiveCourse } from '../hooks/use-active-course';

/**
 * Asks a translator-only user, once, whether Fabalita may send her two
 * invitations. Renders nothing; the question is a system dialog in her words.
 *
 * Asked after a few translations, when the app has proved itself, and never
 * over the Pro screen. Where the phone already allows notifications there is
 * nothing to ask, so the invitations are simply on.
 */
export function FabalitaInvitePrompt(): null {
  const pathname = usePathname();
  const { preferences, update } = usePreferences();
  const { enrollment } = useActiveCourse();
  /** Once per run of the app, so a redraw while the question is open cannot ask it twice. */
  const asked = useRef(false);
  const due =
    !enrollment &&
    !preferences.invitesAsked &&
    !preferences.remindersAsked &&
    preferences.translationsDone >= FABALITA_INVITES.afterTranslations &&
    pathname !== '/upgrade';

  useEffect(() => {
    if (!due || asked.current) return;
    asked.current = true;
    const answer = (allowed: boolean) => {
      services.analytics.log({ name: 'invite_answer', params: { allowed } });
      if (allowed) update({ invitesAsked: true, invites: true, invitesFrom: Date.now() });
      else update({ invitesAsked: true });
    };
    void services.notifications.permission().then((now) => {
      // Only a yes the phone already holds skips the question. Android can
      // report 'denied' for a permission it has never asked, so that still asks.
      if (now === 'granted') return answer(true);
      Alert.alert(
        t('Hi, I’m {name}! 🌱', { name: FABALITA.name }),
        t(
          'Can I send you a note now and then about learning a new language? Just two, never spam.',
        ),
        [
          { text: t('Not now'), style: 'cancel', onPress: () => answer(false) },
          {
            text: t('Yes, sure'),
            onPress: () => {
              void services.notifications.requestPermission().then((granted) => {
                answer(granted);
              });
            },
          },
        ],
        { cancelable: false },
      );
    });
  }, [due, update]);

  return null;
}
