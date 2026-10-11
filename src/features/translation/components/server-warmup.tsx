import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { TRANSLATION_CONFIG } from '@/constants';
import { services } from '@/services';
import { usePreferences } from '@/store';

import { shouldWarmServer } from '../server-warmup';

/**
 * Wakes the translation server when the app opens and whenever it comes back
 * to the foreground, so the first translation of a visit does not wait for the
 * server to start.
 *
 * Renders nothing. Mounted once at the root, outside the onboarding gate on
 * purpose: someone opening the app for the first time spends a little while
 * on the welcome screen and the tour, which is exactly the time the server
 * needs to wake before their first translation.
 *
 * Fire and forget. The ping is never awaited by anything the user is doing,
 * and its result is not shown — a failed wake-up only means the first
 * translation waits as it always did, and that request has its own retries.
 */
export function ServerWarmup(): null {
  const { preferences } = usePreferences();

  /** The latest mode, for a listener subscribed once. */
  const mode = useRef(preferences.translationMode);
  useEffect(() => {
    mode.current = preferences.translationMode;
  });

  useEffect(() => {
    let active = true;
    let lastWarmAt: number | undefined;
    /** Stops a launch and an immediate return from both pinging. */
    let checking = false;

    const warm = async () => {
      if (checking) return;
      checking = true;
      const network = await services.network.getStatus();
      checking = false;

      const now = Date.now();
      const due = shouldWarmServer({
        mode: mode.current,
        network,
        lastWarmAt,
        now,
        intervalMs: TRANSLATION_CONFIG.warmup.intervalMs,
      });
      if (!active || !due) return;

      lastWarmAt = now;
      void services.serverWarmup.warm();
    };

    // The first time: the app has just opened.
    void warm();

    // Every return from the background after that.
    let current = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (current !== 'active' && next === 'active') void warm();
      current = next;
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return null;
}
