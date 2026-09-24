import type { LanguageId, TranslationRequest, TranslationResult } from '@/types';

import type { ServiceResult } from '../../types';

/**
 * The seam between Translita and whatever machine-translation runtime runs
 * on the device.
 *
 * Everything runtime-specific lives behind this: which library, which model
 * format, where files sit, how inference is invoked. `OfflineTranslationService`
 * turns this into the public `TranslationService` the router already knows, so
 * swapping runtimes never reaches a screen.
 *
 * Models are addressed **per language**, not per pair. That follows the
 * runtime selected for Day 9 (see `docs/OFFLINE_TRANSLATION.md`): ML Kit
 * downloads one model per language and needs both sides present to translate
 * between them. A pair is therefore a derived fact, not a stored one.
 */

/**
 * One model's position in its lifecycle.
 *
 * Install state (on disk) and runtime state (in memory) are one chain on
 * purpose: a screen only ever wants to know "can I use this yet", and a single
 * status makes an impossible combination unrepresentable.
 */
export type OfflineModelStatus =
  'not_installed' | 'downloading' | 'installed' | 'loading' | 'ready' | 'unloading' | 'error';

/**
 * Metadata describing a model without having downloaded it.
 *
 * `sizeBytes` and `checksum` are optional because they are only known once a
 * real runtime reports them. Nothing here is invented: a runtime that cannot
 * state a size leaves it undefined rather than guessing.
 */
export type OfflineModel = {
  /** Stable id, in the runtime's own vocabulary. */
  id: string;
  /** The catalogue language this model translates. */
  language: LanguageId;
  /** Runtime-specific format tag, e.g. the runtime's model type. */
  format: string;
  version: string;
  status: OfflineModelStatus;
  sizeBytes?: number;
  checksum?: string;
  /** Epoch ms of the last successful install. */
  installedAt?: number;
};

/** A directed pair the engine can actually translate right now. */
export type OfflinePair = {
  source: LanguageId;
  target: LanguageId;
};

/**
 * The contract a concrete runtime implements.
 *
 * Every method returns a `Result`; none throws. An engine that is not present
 * on the device answers honestly rather than pretending.
 */
export type OfflineTranslationEngine = {
  /** Identifies the runtime in diagnostics, never shown to a user. */
  readonly id: string;

  /**
   * Whether the runtime itself is usable on this device — the native module is
   * present, and any platform prerequisite is met. Says nothing about whether
   * any particular model is installed.
   */
  isAvailable(): ServiceResult<boolean>;

  /** Every language the runtime could translate, installed or not. */
  getSupportedLanguages(): ServiceResult<LanguageId[]>;

  /** Pairs translatable *right now*, given what is installed and loaded. */
  getReadyPairs(): ServiceResult<OfflinePair[]>;

  /** Metadata for every model the runtime knows about. */
  listModels(): ServiceResult<OfflineModel[]>;

  /**
   * Fetches a model onto the device.
   *
   * Separate from `loadModel` on purpose. Downloading is the only operation
   * here that uses the network, and it must never happen as a side effect of
   * translating or loading — offline mode promises exactly that it will not.
   * So it is its own method, called only when a user explicitly asks for it.
   */
  downloadModel(modelId: string): ServiceResult<void>;

  /**
   * Deletes an installed model, reclaiming its space.
   *
   * Distinct from `unloadModel`: this removes files, that releases memory. A
   * runtime with no way to delete must report `not_implemented` rather than
   * resolve, so a screen never shows a removal that did not happen.
   */
  deleteModel(modelId: string): ServiceResult<void>;

  /**
   * Brings a model into memory. Must be safe to call when already loaded.
   *
   * Must **not** download. A model that is not installed makes this fail with
   * `model_missing`, because loading is on the translation path and the
   * translation path never reaches the network in offline mode.
   */
  loadModel(modelId: string): ServiceResult<void>;

  /** Releases a model from memory. Leaves it installed on disk. */
  unloadModel(modelId: string): ServiceResult<void>;

  translate(request: TranslationRequest): ServiceResult<TranslationResult>;
};
