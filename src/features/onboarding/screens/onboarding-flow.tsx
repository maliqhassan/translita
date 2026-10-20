import { useEffect, useState } from 'react';

import { deviceRegion } from '@/constants';
import { services } from '@/services';
import { useLanguagePair } from '@/store';

import { starterPair } from '../starter-pair';

import { LanguageSelectScreen } from './language-select-screen';
import { LoadingScreen } from './loading-screen';
import { OnboardingCarousel } from './onboarding-carousel';
import { WelcomeScreen } from './welcome-screen';

/** In the order they appear. */
type Step = 'loading' | 'language' | 'welcome' | 'tour';

/**
 * First launch, from the greeting to the app.
 *
 * The loading page, the language, welcome, the tour — and Home. No Pro
 * offer: that comes after the first few translations. Which step is showing is local state and nothing else: it lives
 * only as long as the flow does, because a half-finished tour is not a thing
 * worth remembering. Someone who closes the app on slide three starts again
 * from the top, which costs a few taps and avoids storing a step number that
 * would need migrating the day a step is added or removed.
 *
 * Only the *finished* state is persisted, by the caller, and only once.
 */
export function OnboardingFlow({ onComplete: complete }: { onComplete: () => void }) {
  const [step, setStep] = useState<Step>('loading');
  const { setPair } = useLanguagePair();

  // Each step a first-time user reaches, so the drop-off before Home shows.
  useEffect(() => {
    services.analytics.log({ name: 'onboarding_step', params: { step } });
  }, [step]);
  const onComplete = () => {
    services.analytics.log({ name: 'onboarding_complete' });
    complete();
  };

  switch (step) {
    case 'loading':
      return <LoadingScreen onDone={() => setStep('language')} />;

    // Language before anything with words in it, so every screen after it
    // is in the user's own.
    case 'language':
      return (
        <LanguageSelectScreen
          onContinue={(code) => {
            // Home opens on the chosen language into English.
            const pair = starterPair(code, deviceRegion());
            if (pair) setPair(pair);
            setStep('welcome');
          }}
        />
      );

    case 'welcome':
      return <WelcomeScreen onGetStarted={() => setStep('tour')} />;

    case 'tour':
      // Straight into the app. Pro is offered once the app has proved itself,
      // after the first few translations — never before it has done anything.
      return <OnboardingCarousel onDone={onComplete} />;
  }
}
