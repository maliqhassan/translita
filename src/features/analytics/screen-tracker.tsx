import { useSegments } from 'expo-router';
import { useEffect } from 'react';

import { services } from '@/services';

import { screenNameOf } from './screen-name';

/**
 * Reports each screen as it comes into view, which is what gives Firebase its
 * time-on-screen and its most-used-screens report. Renders nothing; mounted
 * once, inside the navigator.
 */
export function ScreenTracker(): null {
  const segments = useSegments();
  const name = screenNameOf(segments);
  useEffect(() => {
    services.analytics.screen(name);
  }, [name]);
  return null;
}
