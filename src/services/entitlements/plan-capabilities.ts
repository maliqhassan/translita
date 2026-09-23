import type { Capability, EntitlementSource, Entitlements, Plan } from './entitlements-service';

/**
 * The one table that says what a plan is worth.
 *
 * Everything else in the app asks about capabilities, so this is the only
 * place a commercial decision is written down. Changing a tier, or adding
 * one, happens here and nowhere else.
 */

export const PLANS: readonly Plan[] = ['free', 'pro'];

/** Every capability the app knows about, in the order they are presented. */
export const CAPABILITIES: readonly Capability[] = [
  'cameraOcr',
  'speechRecognition',
  'offlineTranslation',
  'adFree',
];

/**
 * An unknown, unreadable or not-yet-loaded state is Free.
 *
 * Still the right default, though no longer for the original reason. Nothing
 * about translating is withheld from Free any more, so being wrong here costs
 * the user nothing: they see the app in full, with ads, until the real
 * entitlement arrives. Defaulting the other way would show a paying-tier
 * experience to someone who had not paid.
 */
export const DEFAULT_PLAN: Plan = 'free';

/**
 * Every feature, on both plans. Pro removes the ads.
 *
 * This is the whole product model, and it is deliberately written as an
 * addition rather than as two hand-maintained lists: Pro *is* Free plus
 * `adFree`, so the two can never drift into a state where a paid tier
 * accidentally gains — or a free tier accidentally loses — a translation
 * feature.
 *
 * The earlier model put Camera OCR, dictation and on-device translation behind
 * Pro. That was reversed as a product decision: the features cost the same to
 * run whoever uses them, and gating them made the free app a demo rather than
 * a translator. The capabilities survive the reversal on purpose — see
 * `feature-access.ts` — because the gates they feed still answer the question
 * of whether a *device* can do something, which is not a commercial question
 * at all.
 */
const FREE_CAPABILITIES = ['cameraOcr', 'speechRecognition', 'offlineTranslation'] as const;

export const PLAN_CAPABILITIES: Readonly<Record<Plan, readonly Capability[]>> = {
  free: FREE_CAPABILITIES,
  pro: [...FREE_CAPABILITIES, 'adFree'],
};

/** What Pro adds over Free, derived so a paywall cannot overstate it. */
export const PRO_ONLY_CAPABILITIES: readonly Capability[] = PLAN_CAPABILITIES.pro.filter(
  (capability) => !PLAN_CAPABILITIES.free.includes(capability),
);

export function capabilitiesFor(plan: Plan): ReadonlySet<Capability> {
  return new Set(PLAN_CAPABILITIES[plan]);
}

/** Builds the snapshot a service or store hands out. */
export function entitlementsFor(plan: Plan, source: EntitlementSource): Entitlements {
  return { plan, capabilities: capabilitiesFor(plan), source };
}

/** The starting point before anything has been read from storage. */
export function defaultEntitlements(): Entitlements {
  return entitlementsFor(DEFAULT_PLAN, 'default');
}

export function isPlan(value: unknown): value is Plan {
  return typeof value === 'string' && PLANS.includes(value as Plan);
}
