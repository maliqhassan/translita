import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  CAPABILITIES,
  DEFAULT_PLAN,
  ENTITLEMENTS_VERSION,
  PLANS,
  PLAN_CAPABILITIES,
  PRO_ONLY_CAPABILITIES,
  capabilitiesFor,
  createLocalEntitlementsService,
  defaultEntitlements,
  entitlementsFor,
  getActiveEntitlements,
  getActivePlan,
  hasActiveCapability,
  isPlan,
  parsePlan,
  publishActiveEntitlements,
  resetActiveEntitlements,
  resolveFeatureAccess,
  serializePlan,
  type Capability,
  type Plan,
} from '@/services/entitlements';
import type { PreferencesStorage } from '@/services/preferences';
import { appError, err, ok } from '@/utils';

/**
 * Step 2A: the central entitlement system.
 *
 * The whole point of the design is that capabilities, not plans, are what the
 * app asks about — so most of what is worth pinning here is the table, the
 * fallbacks, and the order the three access questions are answered in.
 */

/** The same one-slot seam the file implementation fills, in memory. */
function memoryStorage(initial: string | null = null): PreferencesStorage & {
  contents: () => string | null;
} {
  let slot = initial;
  return {
    async read() {
      return ok(slot);
    },
    async write(contents: string) {
      slot = contents;
      return ok(undefined);
    },
    async remove() {
      slot = null;
      return ok(undefined);
    },
    contents: () => slot,
  };
}

/** Storage that fails every operation, as a full disk or denied path would. */
function failingStorage(): PreferencesStorage {
  const failure = () => err(appError('storage_error', 'nope'));
  return {
    async read() {
      return failure();
    },
    async write() {
      return failure();
    },
    async remove() {
      return failure();
    },
  };
}

describe('the plan to capability table', () => {
  it('covers every plan', () => {
    assert.deepEqual(PLANS, ['free', 'pro']);
    for (const plan of PLANS) {
      assert.ok(PLAN_CAPABILITIES[plan], `no entry for ${plan}`);
    }
  });

  it('gives Free every feature the app has', () => {
    assert.deepEqual([...PLAN_CAPABILITIES.free].sort(), [
      'cameraOcr',
      'offlineTranslation',
      'speechRecognition',
    ]);
  });

  it('gives Pro every capability the app knows about', () => {
    assert.deepEqual([...PLAN_CAPABILITIES.pro].sort(), [...CAPABILITIES].sort());
  });

  it('separates the two plans by adFree and by nothing else', () => {
    // The product decision, stated as an assertion: the plans differ over
    // advertising and over no feature at all. Anything else appearing here is
    // a translation feature that has been taken away from the free app.
    assert.deepEqual([...PRO_ONLY_CAPABILITIES], ['adFree']);

    const missingFromFree = PLAN_CAPABILITIES.pro.filter(
      (capability) => !PLAN_CAPABILITIES.free.includes(capability),
    );
    assert.deepEqual(missingFromFree, ['adFree']);
  });

  it('gives Free nothing Pro does not also have', () => {
    for (const capability of PLAN_CAPABILITIES.free) {
      assert.ok(PLAN_CAPABILITIES.pro.includes(capability), capability);
    }
  });

  it('names exactly the four capabilities that are actually enforced', () => {
    // 'extendedOnlineQuota' used to sit here. It was declared and advertised
    // but never checked anywhere, so it was removed rather than left as a
    // promise of a daily allowance that no code counts.
    assert.deepEqual(CAPABILITIES, [
      'cameraOcr',
      'speechRecognition',
      'offlineTranslation',
      'adFree',
    ]);
    assert.equal(CAPABILITIES.includes('extendedOnlineQuota' as Capability), false);
  });

  it('states adFree positively, so no call site is a double negative', () => {
    assert.ok(CAPABILITIES.includes('adFree'));
    assert.equal(CAPABILITIES.includes('ads' as Capability), false);
  });

  it('defaults to Free, which is the safe way to be wrong', () => {
    assert.equal(DEFAULT_PLAN, 'free');
    assert.equal(defaultEntitlements().plan, 'free');
    assert.equal(defaultEntitlements().source, 'default');
  });

  it('defaults to a plan that can already use the whole app', () => {
    // Being wrong for the moment before storage is read now costs the user
    // nothing but an advert, where it used to cost them the camera.
    const capabilities = defaultEntitlements().capabilities;

    assert.equal(capabilities.has('cameraOcr'), true);
    assert.equal(capabilities.has('speechRecognition'), true);
    assert.equal(capabilities.has('offlineTranslation'), true);
    assert.equal(capabilities.has('adFree'), false);
  });

  it('builds a snapshot from a plan and where it came from', () => {
    const pro = entitlementsFor('pro', 'account');

    assert.equal(pro.plan, 'pro');
    assert.equal(pro.source, 'account');
    assert.equal(pro.capabilities.has('cameraOcr'), true);
  });

  it('hands out a fresh capability set each time, not a shared one', () => {
    const first = capabilitiesFor('free') as Set<Capability>;
    first.add('adFree');

    assert.equal(capabilitiesFor('free').has('adFree'), false);
  });

  it('recognises only the plans it knows', () => {
    assert.equal(isPlan('free'), true);
    assert.equal(isPlan('pro'), true);
    assert.equal(isPlan('platinum'), false);
    assert.equal(isPlan(undefined), false);
    assert.equal(isPlan({ plan: 'pro' }), false);
  });
});

describe('has(), for every capability on every plan', () => {
  it('answers true on Free for every capability but adFree', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    await service.load();

    for (const capability of CAPABILITIES) {
      assert.equal(service.has(capability), capability !== 'adFree', capability);
    }
  });

  it('answers true for all of them on Pro', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    await service.setPlan('pro');

    for (const capability of CAPABILITIES) {
      assert.equal(service.has(capability), true, capability);
    }
  });
});

describe('current(), before anything is loaded', () => {
  it('is Free, synchronously, from the moment the service exists', () => {
    const service = createLocalEntitlementsService(memoryStorage());

    // Gates are consulted during render and from singletons, so this cannot
    // be allowed to be undefined or to require awaiting.
    assert.equal(service.current().plan, 'free');
    assert.equal(service.current().source, 'default');
    assert.equal(service.has('adFree'), false);
    assert.equal(service.has('cameraOcr'), true, 'features are not withheld while loading');
  });

  it('reads nothing on construction', async () => {
    let reads = 0;
    const storage: PreferencesStorage = {
      async read() {
        reads += 1;
        return ok(null);
      },
      async write() {
        return ok(undefined);
      },
      async remove() {
        return ok(undefined);
      },
    };

    createLocalEntitlementsService(storage);
    assert.equal(reads, 0, 'constructing must not touch storage');
  });

  it('reports itself available, because it is a local read', async () => {
    assert.equal(await createLocalEntitlementsService(memoryStorage()).isAvailable(), true);
  });
});

describe('load()', () => {
  it('returns Free when nothing has been written yet', async () => {
    const loaded = await createLocalEntitlementsService(memoryStorage()).load();

    assert.equal(loaded.plan, 'free');
    // A first launch is a default, not something read off the device.
    assert.equal(loaded.source, 'default');
  });

  it('returns Free when storage cannot be read at all', async () => {
    const loaded = await createLocalEntitlementsService(failingStorage()).load();

    assert.equal(loaded.plan, 'free');
    assert.equal(loaded.source, 'default');
  });

  it('returns Free for contents that are not JSON', async () => {
    const loaded = await createLocalEntitlementsService(memoryStorage('{ truncated')).load();

    assert.equal(loaded.plan, 'free');
  });

  it('returns Free for JSON of the wrong shape', async () => {
    for (const corrupt of ['null', '[]', '"pro"', '42', '{}', '{"plan":"platinum"}']) {
      const loaded = await createLocalEntitlementsService(memoryStorage(corrupt)).load();
      assert.equal(loaded.plan, 'free', corrupt);
    }
  });

  it('never rejects, whatever storage does', async () => {
    // The launch depends on this: an entitlement problem may cost the plan,
    // never the app.
    await assert.doesNotReject(() => createLocalEntitlementsService(failingStorage()).load());
    await assert.doesNotReject(() =>
      createLocalEntitlementsService(memoryStorage('nonsense')).load(),
    );
  });

  it('restores a stored plan and marks it as read from the device', async () => {
    const service = createLocalEntitlementsService(memoryStorage(serializePlan('pro')));
    const loaded = await service.load();

    assert.equal(loaded.plan, 'pro');
    assert.equal(loaded.source, 'local');
    assert.equal(service.has('adFree'), true);
  });

  it('updates current() as a side effect, not only its return value', async () => {
    const service = createLocalEntitlementsService(memoryStorage(serializePlan('pro')));
    await service.load();

    assert.equal(service.current().plan, 'pro');
  });

  it('never reports a locally stored plan as account-issued', async () => {
    // `account` is reserved for an entitlement a server issued after checking
    // a receipt. A file on the device must never be able to claim it.
    const service = createLocalEntitlementsService(memoryStorage(serializePlan('pro')));
    await service.load();

    assert.notEqual(service.current().source, 'account');
  });
});

describe('persistence round trip', () => {
  it('survives being written and read back by a new service', async () => {
    const storage = memoryStorage();

    const first = createLocalEntitlementsService(storage);
    await first.setPlan('pro');

    const second = createLocalEntitlementsService(storage);
    assert.equal((await second.load()).plan, 'pro');
  });

  it('stores the plan and a version, and nothing else', () => {
    const stored = JSON.parse(serializePlan('pro')) as Record<string, unknown>;

    assert.deepEqual(stored, { version: ENTITLEMENTS_VERSION, plan: 'pro' });
  });

  it('derives capabilities from the plan rather than storing them', () => {
    // A stored capability list would let one edited field buy one feature,
    // and would go stale the moment the tiers changed.
    assert.equal(serializePlan('pro').includes('adFree'), false);
    assert.equal(serializePlan('pro').includes('capabilities'), false);
  });

  it('ignores any capabilities that appear in stored data', async () => {
    const forged = JSON.stringify({ version: 1, plan: 'free', capabilities: ['adFree'] });
    const service = createLocalEntitlementsService(memoryStorage(forged));
    await service.load();

    assert.equal(service.has('adFree'), false);
  });

  it('keeps the runtime change even when the write fails', async () => {
    const service = createLocalEntitlementsService(failingStorage());
    const result = await service.setPlan('pro');

    // The caller is told the write failed, but the switch still applied — the
    // same rule preferences follow.
    assert.equal(result.ok, false);
    assert.equal(service.current().plan, 'pro');
  });

  it('reports a successful write as ok', async () => {
    const result = await createLocalEntitlementsService(memoryStorage()).setPlan('pro');
    assert.equal(result.ok, true);
  });

  it('parses a plan out of a record, and defaults otherwise', () => {
    assert.equal(parsePlan({ plan: 'pro' }), 'pro');
    assert.equal(parsePlan({ plan: 'free' }), 'free');
    assert.equal(parsePlan({ plan: 'PRO' }), 'free');
    assert.equal(parsePlan(null), 'free');
    assert.equal(parsePlan(['pro']), 'free');
  });
});

describe('subscribe()', () => {
  it('fires when the plan changes', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    let calls = 0;
    service.subscribe(() => {
      calls += 1;
    });

    await service.setPlan('pro');
    assert.equal(calls, 1);
  });

  it('fires on load, so a hydrated plan reaches every listener', async () => {
    const service = createLocalEntitlementsService(memoryStorage(serializePlan('pro')));
    let calls = 0;
    service.subscribe(() => {
      calls += 1;
    });

    await service.load();
    assert.equal(calls, 1);
  });

  it('sees the new snapshot by the time it is called', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    const seen: Plan[] = [];
    service.subscribe(() => seen.push(service.current().plan));

    await service.setPlan('pro');
    await service.setPlan('free');

    assert.deepEqual(seen, ['pro', 'free']);
  });

  it('notifies every listener', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    const calls: string[] = [];
    service.subscribe(() => calls.push('a'));
    service.subscribe(() => calls.push('b'));

    await service.setPlan('pro');
    assert.deepEqual(calls.sort(), ['a', 'b']);
  });

  it('stops calling a listener that unsubscribed', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    let calls = 0;
    const unsubscribe = service.subscribe(() => {
      calls += 1;
    });

    await service.setPlan('pro');
    unsubscribe();
    await service.setPlan('free');

    assert.equal(calls, 1);
  });

  it('leaves other listeners alone when one unsubscribes', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    let kept = 0;
    const unsubscribe = service.subscribe(() => {});
    service.subscribe(() => {
      kept += 1;
    });

    unsubscribe();
    await service.setPlan('pro');

    assert.equal(kept, 1);
  });

  it('is safe to unsubscribe twice', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    const unsubscribe = service.subscribe(() => {});

    unsubscribe();
    assert.doesNotThrow(unsubscribe);
  });
});

describe('changes propagate to what the app reads', () => {
  it('changes what has() answers immediately, with no reload', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    await service.load();
    assert.equal(service.has('adFree'), false);

    await service.setPlan('pro');
    assert.equal(service.has('adFree'), true);

    await service.setPlan('free');
    assert.equal(service.has('adFree'), false);
  });

  it('marks a switched plan as read from the device', async () => {
    const service = createLocalEntitlementsService(memoryStorage());
    await service.setPlan('pro');

    assert.equal(service.current().source, 'local');
  });
});

describe('the bridge for code that cannot use a hook', () => {
  it('starts on the default', () => {
    resetActiveEntitlements();

    assert.equal(getActivePlan(), 'free');
    assert.equal(hasActiveCapability('adFree'), false);
    assert.equal(hasActiveCapability('offlineTranslation'), true);
    assert.equal(getActiveEntitlements().source, 'default');
  });

  it('mirrors whatever the store publishes', () => {
    resetActiveEntitlements();
    publishActiveEntitlements(entitlementsFor('pro', 'local'));

    assert.equal(getActivePlan(), 'pro');
    assert.equal(hasActiveCapability('adFree'), true);
    assert.equal(getActiveEntitlements().source, 'local');
  });

  it('goes back to the default when reset', () => {
    publishActiveEntitlements(entitlementsFor('pro', 'local'));
    resetActiveEntitlements();

    assert.equal(getActivePlan(), 'free');
  });
});

describe('the order the three access questions are answered in', () => {
  it('is unavailable when the capability has not shipped', () => {
    assert.equal(
      resolveFeatureAccess({ shipped: false, supported: true, entitled: true }),
      'unavailable',
    );
  });

  it('is unavailable when the device cannot do it, whatever the plan', () => {
    assert.equal(
      resolveFeatureAccess({ shipped: true, supported: false, entitled: false }),
      'unavailable',
    );
    assert.equal(
      resolveFeatureAccess({ shipped: true, supported: false, entitled: true }),
      'unavailable',
    );
  });

  it('never reports locked for a device that could not use the feature anyway', () => {
    // This is the whole reason the order is fixed: `locked` leads to a
    // paywall, and selling someone a feature their phone cannot run is
    // selling them nothing.
    for (const shipped of [true, false]) {
      assert.notEqual(
        resolveFeatureAccess({ shipped, supported: false, entitled: false }),
        'locked',
      );
    }
    assert.notEqual(
      resolveFeatureAccess({ shipped: false, supported: true, entitled: false }),
      'locked',
    );
  });

  it('is locked only when it would work here but the plan excludes it', () => {
    assert.equal(
      resolveFeatureAccess({ shipped: true, supported: true, entitled: false }),
      'locked',
    );
  });

  it('is allowed when all three hold', () => {
    assert.equal(
      resolveFeatureAccess({ shipped: true, supported: true, entitled: true }),
      'allowed',
    );
  });

  it('answers one of exactly three things for every combination', () => {
    const seen = new Set<string>();
    for (const shipped of [true, false]) {
      for (const supported of [true, false]) {
        for (const entitled of [true, false]) {
          seen.add(resolveFeatureAccess({ shipped, supported, entitled }));
        }
      }
    }

    assert.deepEqual([...seen].sort(), ['allowed', 'locked', 'unavailable']);
  });
});
