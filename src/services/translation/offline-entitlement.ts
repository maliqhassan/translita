import { FEATURES } from '@/constants';

import { hasActiveCapability } from '../entitlements';

/**
 * Whether the on-device engine may run for the user as they stand right now.
 *
 * Currently: yes, for everyone. Both plans hold the capability and enforcement
 * is switched off, so this answers true. It is kept — rather than deleted and
 * its call sites unwired — because it is the only place that knows *why*, and
 * because the two bypasses it closes are not obvious enough to rediscover.
 *
 * One function, two callers — the routing policy and the cache — so the answer
 * cannot differ between "may this engine be chosen" and "may this stored
 * result be handed back". Two copies of this rule would eventually disagree,
 * and the disagreement would be a free upgrade.
 *
 * It reads the entitlement through `hasActiveCapability`, the module-level
 * bridge the entitlements store publishes to. That is deliberate: the router
 * and the registry are plain singletons built at import time and cannot use a
 * hook. This is not a second entitlement system — it is a read of the only one.
 *
 * Called per request rather than captured once. A plan that changes has to
 * take effect on the very next translation, and anything memoised here would
 * be precisely the stale state the gate exists to prevent.
 *
 * `resolveFeatureAccess` is deliberately not used. Its middle layer is the
 * device probe, and the whole point of this gate is to exclude the engine
 * *before* `isAvailable()` is ever asked — so there would be nothing truthful
 * to pass for it, and the call would read as a three-layer check while testing
 * one.
 */
export function offlineTranslationPermitted(): boolean {
  return offlineTranslationPermittedFor(hasActiveCapability('offlineTranslation'));
}

/**
 * The same rule, given the capability rather than reading it.
 *
 * React cannot use the bridge above: a component reading a module-level
 * snapshot does not re-render when the plan changes, so a locked control would
 * stay locked after an upgrade. The UI holds the capability already — from
 * `useEntitlements()` — and needs only the rollout flag applied to it.
 *
 * Split out rather than duplicated so there is still exactly one place that
 * knows enforcement is behind a flag. Two copies would eventually disagree,
 * and a UI that said "Pro only" while routing allowed it — or the reverse —
 * is worse than either behaviour on its own.
 */
export function offlineTranslationPermittedFor(entitled: boolean): boolean {
  // Enforcement is off, so on-device translation is available on every plan —
  // which is also what the capability table says, independently. Two answers
  // agreeing is the point: the feature cannot be lost to a single edit in
  // either place. See `FEATURES.offlineEntitlement`.
  if (!FEATURES.offlineEntitlement) return true;

  return entitled;
}
