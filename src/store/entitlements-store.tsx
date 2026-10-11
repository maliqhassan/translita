import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  defaultEntitlements,
  developmentEntitlements,
  publishActiveEntitlements,
  services,
  type Capability,
  type Entitlements,
  type Plan,
} from '@/services';

/**
 * What the user's plan entitles them to.
 *
 * Screens and hooks ask this store about *capabilities*. The plan itself is
 * exposed for the one thing that legitimately needs it — telling the user
 * which plan they are on — and for nothing else: a `plan === 'pro'` check in a
 * screen is the thing this store exists to prevent.
 */

export type EntitlementsContextValue = {
  /** The commercial tier. For display; branch on `has` instead. */
  plan: Plan;
  capabilities: ReadonlySet<Capability>;
  /** Whether the current plan includes a capability. */
  has: (capability: Capability) => boolean;
  /**
   * False until storage has been read.
   *
   * Gates wait for this. Without it a Pro user would see a locked control for
   * the moment between the device probe resolving and the plan arriving.
   */
  loaded: boolean;
};

const EntitlementsContext = createContext<EntitlementsContextValue | null>(null);

/**
 * Hydrates in the background rather than holding up the launch.
 *
 * Preferences block rendering because the wrong language pair would be
 * visibly corrected a moment later. Entitlements do not need to: the default
 * is Free, which grants nothing, so an un-hydrated moment can never hand out
 * a paid feature — and the gates wait for `loaded` rather than acting on the
 * default.
 */
export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const [entitlements, setEntitlements] = useState<Entitlements>(defaultEntitlements);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;

    /** Pulls the service's snapshot into React state and onto the bridge. */
    const sync = () => {
      const current = services.entitlements.current();
      publishActiveEntitlements(current);
      services.analytics.setUserProperty({ name: 'plan', value: current.plan });
      if (active) setEntitlements(current);
    };

    // Every change goes through the service, including the development
    // switcher, so subscribing is what makes a plan change take effect
    // everywhere without a restart.
    const unsubscribe = services.entitlements.subscribe(sync);

    void services.entitlements.load().then(() => {
      if (!active) return;
      sync();
      setLoaded(true);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo<EntitlementsContextValue>(
    () => ({
      plan: entitlements.plan,
      capabilities: entitlements.capabilities,
      has: (capability) => entitlements.capabilities.has(capability),
      loaded,
    }),
    [entitlements, loaded],
  );

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

export function useEntitlements(): EntitlementsContextValue {
  const context = useContext(EntitlementsContext);
  if (!context) {
    throw new Error('useEntitlements must be used inside <EntitlementsProvider>.');
  }
  return context;
}

export type PlanSwitcher = {
  plan: Plan;
  setPlan: (plan: Plan) => void;
};

/**
 * The development plan switcher, or `undefined` when there is not one.
 *
 * Undefined in a release build, because the registry only names the
 * development implementation behind `__DEV__`. Callers render nothing when
 * this is undefined, so the switcher cannot ship: there is no setter for it
 * to call and no branch left after the bundler folds the constant.
 */
export function useDevelopmentPlanSwitcher(): PlanSwitcher | undefined {
  const { plan } = useEntitlements();

  const setPlan = useCallback((next: Plan) => {
    // The service publishes to its subscribers, which is how the store, the
    // bridge and every gate update without a restart.
    void developmentEntitlements?.setPlan(next);
  }, []);

  return developmentEntitlements ? { plan, setPlan } : undefined;
}
