import { useEffect, useRef, useState } from 'react';

import { useSpeechRecognition } from '@/features/translation';
import { services } from '@/services';
import { useIsOffline } from '@/store';
import type { AddressForm } from '@/types';

import type { CoachConnection } from '../lesson/roleplay-step';
import type { SpeechPractice } from '../lesson/steps';

/**
 * Speaking practice, through the app's one recogniser.
 *
 * Each `start` says where the next thing heard should go, so one recogniser
 * serves every step of a lesson or an exam in turn.
 */
export function useSpeechPractice(courseId: string): SpeechPractice {
  const onHeard = useRef<((text: string) => void) | undefined>(undefined);
  const speech = useSpeechRecognition({
    onPartial: () => {},
    onFinal: (text) => onHeard.current?.(text),
  });
  return {
    available: speech.status !== 'unavailable' && speech.status !== 'locked',
    listening: speech.listening,
    start: (language, heard) => {
      onHeard.current = heard;
      speech.toggle(language);
    },
    stop: () => speech.toggle(courseId),
  };
}

/** The AI partner: on the server, so only with a backend and a connection. */
export function useCoachConnection(addressAs: AddressForm): CoachConnection {
  const offline = useIsOffline();
  const [configured, setConfigured] = useState(false);
  useEffect(() => {
    let active = true;
    void services.coach.isAvailable().then((available) => {
      if (active) setConfigured(available);
    });
    return () => {
      active = false;
    };
  }, []);
  return {
    available: configured && !offline,
    roleplay: (ask) => services.coach.roleplay(ask),
    addressAs,
  };
}
