import { usePathname, useRootNavigationState, useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { usePreferences } from '@/store';

import { shouldReturnToAcademy } from '../rules';

const ACADEMY_HOME = '/academy' as Href;

/**
 * Reopens the AI Academy for someone who closed the app while in it.
 *
 * The translator is home, and stays where the app opens — except for a
 * learner who put the app away mid-study and comes back the same day: they
 * land on the Academy's dashboard, whose Continue button resumes the very
 * step they left. The Academy opens on top of the translator, so Back still
 * leads home.
 *
 * Where the user was is noted each time the app goes to the background, and
 * read once, when the navigator first exists. Renders nothing.
 */
export function ReturnToAcademy(): null {
  const router = useRouter();
  const pathname = usePathname();
  const ready = Boolean(useRootNavigationState()?.key);
  const { preferences, update } = usePreferences();
  // Read as the app opens, before this session overwrites it.
  const [leftAt] = useState(preferences.academyLeftAt);
  const returned = useRef(false);
  const where = useRef(pathname);

  useEffect(() => {
    where.current = pathname;
  }, [pathname]);

  useEffect(() => {
    if (!ready || returned.current) return;
    returned.current = true;
    if (shouldReturnToAcademy(leftAt, Date.now())) router.push(ACADEMY_HOME);
  }, [ready, leftAt, router]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'background') return;
      const inAcademy = where.current.startsWith('/academy');
      void update({ academyLeftAt: inAcademy ? Date.now() : 0 });
    });
    return () => subscription.remove();
  }, [update]);

  return null;
}
