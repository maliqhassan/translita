import { getLanguage } from '@/constants';
import type { LanguageId } from '@/types';
import { appError, err, ok } from '@/utils';

import type { ServiceResult } from '../../types';

import { isInstalled, isUsable } from './model-lifecycle';
import type { OfflineModel, OfflinePair } from './offline-engine';

/**
 * What the app knows about on-device models, without downloading any.
 *
 * The registry is the join between two sources that must not be confused:
 *
 *   language catalogue  ->  which languages the *app* has an identity for
 *   runtime capability  ->  which of those a *runtime* can actually translate
 *
 * The catalogue stays authoritative for identity. Nothing here ever marks a
 * language offline-capable on its own: a model appears only because a runtime
 * reported it, which is why every catalogue entry still says
 * `offline.supported: false` while no runtime is installed.
 */

/** What a runtime reports about itself. Supplied by the engine, never guessed. */
export type RuntimeCapability = {
  /** Runtime-specific format tag recorded on each model. */
  format: string;
  /** Model catalogue version, as the runtime states it. */
  version: string;
  /** Languages the runtime can translate, in Translita LanguageIds. */
  languages: readonly LanguageId[];
};

export type ModelRegistry = {
  /** Every model the runtime knows about, with its current status. */
  list(): ServiceResult<OfflineModel[]>;
  get(modelId: string): ServiceResult<OfflineModel>;
  /** The model for a language, if the runtime supports that language. */
  forLanguage(language: LanguageId): ServiceResult<OfflineModel>;
  /** True when the runtime could translate this language, installed or not. */
  supportsLanguage(language: LanguageId): boolean;
  /**
   * Pairs translatable right now.
   *
   * A pair needs *both* sides loaded, because the selected runtime keys models
   * by language rather than by pair.
   */
  readyPairs(): ServiceResult<OfflinePair[]>;
  /** Whether this exact pair can run offline at this moment. */
  isPairReady(source: LanguageId, target: LanguageId): ServiceResult<boolean>;
  /** Records a status change from the engine. */
  setStatus(modelId: string, status: OfflineModel['status']): ServiceResult<OfflineModel>;
};

/** Model ids are namespaced by runtime, so two runtimes can never collide. */
export function offlineModelId(runtimeId: string, language: LanguageId): string {
  return `${runtimeId}:${language}`;
}

export type ModelRegistryOptions = {
  runtimeId: string;
  capability: RuntimeCapability;
  /** Statuses known at construction, e.g. rehydrated from disk. */
  initialStatus?: Readonly<Record<string, OfflineModel['status']>>;
};

export function createModelRegistry(options: ModelRegistryOptions): ModelRegistry {
  const { runtimeId, capability } = options;

  // Only languages the catalogue also knows are admitted. A runtime naming a
  // language we have no identity for is a mapping bug, not a new language,
  // and silently inventing an entry would corrupt the catalogue's authority.
  const languages = capability.languages.filter((language) => getLanguage(language) !== undefined);

  const models = new Map<string, OfflineModel>(
    languages.map((language) => {
      const id = offlineModelId(runtimeId, language);
      return [
        id,
        {
          id,
          language,
          format: capability.format,
          version: capability.version,
          status: options.initialStatus?.[id] ?? 'not_installed',
        },
      ];
    }),
  );

  const byLanguage = new Map<LanguageId, string>(
    languages.map((language) => [language, offlineModelId(runtimeId, language)]),
  );

  const missing = (modelId: string) =>
    err(appError('model_missing', `No offline model is registered as ${modelId}.`));

  function readyLanguages(): LanguageId[] {
    return [...models.values()].filter((model) => isUsable(model.status)).map((m) => m.language);
  }

  return {
    async list() {
      return ok([...models.values()]);
    },

    async get(modelId: string) {
      const model = models.get(modelId);
      return model ? ok(model) : missing(modelId);
    },

    async forLanguage(language: LanguageId) {
      const id = byLanguage.get(language);
      if (!id) {
        return err(
          appError('model_missing', `No offline model covers ${language} on this runtime.`),
        );
      }
      return this.get(id);
    },

    supportsLanguage(language: LanguageId) {
      return byLanguage.has(language);
    },

    async readyPairs() {
      const ready = readyLanguages();
      const pairs: OfflinePair[] = [];

      // Every ordered combination of loaded languages; a pair is only ready
      // when both of its models are.
      for (const source of ready) {
        for (const target of ready) {
          if (source !== target) pairs.push({ source, target });
        }
      }
      return ok(pairs);
    },

    async isPairReady(source: LanguageId, target: LanguageId) {
      if (source === target) return ok(false);
      const ready = new Set(readyLanguages());
      return ok(ready.has(source) && ready.has(target));
    },

    async setStatus(modelId: string, status: OfflineModel['status']) {
      const model = models.get(modelId);
      if (!model) return missing(modelId);

      const updated: OfflineModel = {
        ...model,
        status,
        installedAt: isInstalled(status) ? (model.installedAt ?? Date.now()) : undefined,
      };
      models.set(modelId, updated);
      return ok(updated);
    },
  };
}
