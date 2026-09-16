import { useCallback, useEffect, useRef, useState } from 'react';

import {
  services,
  toLanguagePacks,
  type LanguagePack,
  type PackOverride,
  type PackOverrides,
} from '@/services';
import type { AppError } from '@/types';

import { useOfflineTranslationPermitted } from './use-offline-entitlement';

/**
 * Language packs, as the screen needs them.
 *
 * The runtime is the single source of truth for what is on the device, so this
 * always re-reads `listModels()` after a change rather than mutating a local
 * copy. What the runtime *cannot* know — that work is in flight, or that the
 * last attempt failed — is held here and overlaid, which keeps the two kinds
 * of state from being confused for one another.
 *
 * Nothing here downloads on its own. `download` runs only when a user asks.
 */

export type LanguagePacksState = {
  /** Whether the runtime exists in this build at all. */
  available: boolean;
  loading: boolean;
  packs: readonly LanguagePack[];
  /** Set when the list itself could not be read. */
  error?: AppError;
  /** Set when the last download or removal failed, for a dismissible notice. */
  actionError?: AppError;
  /**
   * Whether downloading is offered at all.
   *
   * False means the plan does not include on-device translation, so a
   * downloaded pack could not be used. Removal stays available either way.
   */
  canDownload: boolean;
  download: (modelId: string) => void;
  remove: (modelId: string) => void;
  dismissActionError: () => void;
};

export function useLanguagePacks(): LanguagePacksState {
  const canDownload = useOfflineTranslationPermitted();
  const [packs, setPacks] = useState<readonly LanguagePack[]>([]);
  const [overrides, setOverrides] = useState<PackOverrides>({});
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<AppError | undefined>(undefined);
  const [actionError, setActionError] = useState<AppError | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  /** Model ids with an operation in flight, so a double tap cannot race. */
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      const runtime = services.offlineModels;
      const isAvailable = await runtime.isAvailable();
      const models = await runtime.listModels();
      if (cancelled) return;

      setAvailable(isAvailable.ok && isAvailable.value);
      if (models.ok) {
        setPacks(toLanguagePacks(models.value));
        setError(undefined);
      } else {
        setPacks([]);
        setError(models.error);
      }
      setLoading(false);
    };

    void read();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((current) => current + 1), []);

  /**
   * Both actions share a shape: mark what is happening, call the runtime, then
   * re-read. The override is cleared on success so the runtime's own answer
   * takes over, and set to `failed` otherwise so the row can offer a retry.
   *
   * A second tap while one is in flight is ignored rather than queued: ML Kit
   * has no cancellation, so two overlapping calls for one model would race to
   * decide what the row finally says.
   */
  const run = useCallback(
    (
      modelId: string,
      busy: Extract<PackOverride, 'downloading' | 'removing'>,
      action: (id: string) => Promise<{ ok: boolean; error?: AppError }>,
    ) => {
      // A ref, not state: the guard has to hold for a second tap in the same
      // tick, and a state updater does not run until the next render.
      if (inFlight.current.has(modelId)) return;
      inFlight.current.add(modelId);

      setOverrides((current) => ({ ...current, [modelId]: busy }));
      // Retrying is what clears the previous failure; nothing else does, so a
      // stale banner cannot outlive the attempt it described.
      setActionError(undefined);

      void (async () => {
        const result = await action(modelId);
        inFlight.current.delete(modelId);

        setOverrides((current) => {
          const next = { ...current };
          if (result.ok) delete next[modelId];
          else next[modelId] = 'failed';
          return next;
        });

        if (!result.ok && result.error) setActionError(result.error);
        reload();
      })();
    },
    [reload],
  );

  /**
   * Downloads only when the plan includes on-device translation.
   *
   * Guarded here rather than only in the screen, so no stale callback or
   * second entry point can start a large download for a user who could not
   * use the result. A model is tens of megabytes; fetching one that routing
   * will refuse to touch wastes the user's data and their storage.
   */
  const download = useCallback(
    (modelId: string) => {
      if (!canDownload) return;
      run(modelId, 'downloading', (id) => services.offlineModels.downloadModel(id));
    },
    [canDownload, run],
  );

  const remove = useCallback(
    (modelId: string) => run(modelId, 'removing', (id) => services.offlineModels.deleteModel(id)),
    [run],
  );

  return {
    available,
    loading,
    // Overlaid during render rather than written into state, so in-flight work
    // can never be mistaken for something the device actually has.
    packs: applyOverrides(packs, overrides),
    error,
    actionError,
    canDownload,
    download,
    // Deliberately ungated: reclaiming storage must never require a
    // subscription, and a lapsed subscriber still owns the space.
    remove,
    dismissActionError: useCallback(() => setActionError(undefined), []),
  };
}

function applyOverrides(
  packs: readonly LanguagePack[],
  overrides: PackOverrides,
): readonly LanguagePack[] {
  if (Object.keys(overrides).length === 0) return packs;
  return packs.map((pack) => {
    const override = overrides[pack.modelId];
    return override ? { ...pack, state: override } : pack;
  });
}
