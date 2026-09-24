import type { Unsubscribe } from '@/types';

import type { Service, ServiceResult } from '../types';

/**
 * What the user is entitled to, and nothing about how they came to be.
 *
 * Plans are a commercial fact; capabilities are what the app actually asks
 * about. Screens and hooks consult capabilities only, so moving a feature
 * between tiers — or adding a tier — is a change to one table rather than a
 * change to every call site. That indirection is what let the tiers be
 * rewritten to "every feature on both plans, Pro removes the ads" by editing
 * `PLAN_CAPABILITIES` and nothing else.
 *
 * IMPORTANT: this is product gating, not purchase enforcement. The state
 * behind it is a small file in the app's own storage, so a rooted device or a
 * repackaged build can change it. That is acceptable while nothing is being
 * sold. Once money is involved, the entitlement has to be issued by a server
 * that validated the receipt itself, and this contract is shaped so that
 * implementation can drop in without the callers noticing.
 */

/** The commercial tier. Only the entitlements module should branch on this. */
export type Plan = 'free' | 'pro';

/**
 * What code asks about.
 *
 * `adFree` is deliberately positive: `has('adFree')` reads correctly, where a
 * negative `ads` capability would make every call site a double negative.
 */
export type Capability =
  | 'cameraOcr'
  | 'speechRecognition'
  | 'offlineTranslation'
  | 'adFree'
  /**
   * Conversational practice with an AI partner.
   *
   * The second paid capability, and the first that costs money to run: every
   * exchange is a billed model call. That is why it is the one feature with a
   * free allowance rather than a hard wall — a taste is worth paying for, an
   * unlimited free tier is not.
   */
  | 'aiTutor';

/**
 * Where the current entitlement came from.
 *
 * `default` is the un-hydrated starting point, `local` is device-stored state,
 * and `account` is reserved for a server-issued entitlement. It exists so a
 * cached entitlement can later be told apart from a verified one.
 */
export type EntitlementSource = 'default' | 'local' | 'account';

export type Entitlements = {
  readonly plan: Plan;
  readonly capabilities: ReadonlySet<Capability>;
  readonly source: EntitlementSource;
};

/**
 * The contract everything above the service layer depends on.
 *
 * `current()` is synchronous because gates are consulted during render and
 * from singletons that cannot await. It never fails: an unknown state is Free,
 * which fails closed commercially and can never stop the app starting.
 *
 * There is deliberately no setter here. A billing-backed implementation has no
 * business offering one, and putting it on the base contract would force it
 * to — so the development implementation widens the type instead.
 */
export type EntitlementsService = Service & {
  /** The snapshot right now. Free until `load` has resolved. */
  current(): Entitlements;
  /** Hydrates from storage. Always resolves; never rejects. */
  load(): Promise<Entitlements>;
  has(capability: Capability): boolean;
  /** Called after every change to the snapshot. */
  subscribe(listener: () => void): Unsubscribe;
};

/**
 * The development implementation, with a setter for the plan switcher.
 *
 * Bound in the registry behind `EntitlementsService`, so the setter is
 * reachable only through the one export that names it. When real billing
 * lands, this type stops being implemented and every accidental caller
 * becomes a compile error rather than a silent free upgrade.
 */
export type DevelopmentEntitlementsService = EntitlementsService & {
  setPlan(plan: Plan): ServiceResult<void>;
};
