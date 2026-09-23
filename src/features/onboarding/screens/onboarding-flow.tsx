import { useState } from 'react';

import { OnboardingCarousel } from './onboarding-carousel';
import { WelcomeScreen } from './welcome-screen';

/**
 * First launch, from the greeting to the app.
 *
 * Welcome, then the tour, then done. Which of the two is showing is local
 * state and nothing else: it lives only as long as the flow does, because a
 * half-finished tour is not a thing worth remembering. Someone who closes the
 * app on slide three sees the welcome screen again, which is the right
 * outcome — it costs two taps and avoids storing a step number that would then
 * need migrating the day a slide is added or removed.
 *
 * Only the *finished* state is persisted, by the caller, and only once. Both
 * ways out — Skip and Start Translating — call the same `onComplete`, so there
 * is one place where onboarding is recorded as done rather than two that could
 * drift apart.
 */
export function OnboardingFlow({ onComplete }: { onComplete: () => void }) {
  const [started, setStarted] = useState(false);

  if (!started) return <WelcomeScreen onGetStarted={() => setStarted(true)} />;

  return <OnboardingCarousel onDone={onComplete} />;
}
