/**
 * Server configuration, read once at boot.
 *
 * SECURITY: everything here is server-side only. The provider credential lives
 * in this process and nowhere else — not in a response, not in a log line, and
 * never in anything the mobile app can read. See `docs/ARCHITECTURE.md`.
 */

export type ProviderName = 'azure' | 'fake';

export type ServerConfig = {
  port: number;
  provider: ProviderName;
  /** Absent when running the fake provider. */
  providerApiKey?: string;
  /** Azure resources outside the global endpoint need their region. */
  providerRegion?: string;
  /**
   * Overrides the provider's global endpoint.
   *
   * Azure resources created against a specific geography, or behind a private
   * endpoint, do not answer on the global host. Left unset for the ordinary
   * global resource, which is what most deployments use.
   */
  providerEndpoint?: string;
  /** Longest text the API will accept, in characters. */
  maxTextLength: number;
  /** Hard cap on request body size, enforced before parsing. */
  maxBodyBytes: number;
  /** Upstream call timeout. */
  providerTimeoutMs: number;
  rateLimit: { max: number; windowMs: number };

  /**
   * The language-practice tutor. Absent means the endpoint is not served.
   *
   * Kept apart from the translation credential on purpose: they are different
   * vendors, they are billed differently, and a deployment may legitimately
   * want translation without practice.
   */
  tutorApiKey?: string;
  tutorModel: string;
  tutorMaxTokens: number;
  /**
   * A much tighter limit than translation's.
   *
   * Translation runs against a hard-capped free tier that cannot bill. This
   * one bills per request, so the limit is the first line of defence and is
   * deliberately low enough to be felt by a script and not by a learner.
   */
  tutorRateLimit: { max: number; windowMs: number };
};

function readInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readProvider(value: string | undefined): ProviderName {
  return value === 'fake' ? 'fake' : 'azure';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const provider = readProvider(env.TRANSLATION_PROVIDER);
  const apiKey = env.TRANSLATION_PROVIDER_API_KEY?.trim();

  return {
    port: readInt(env.PORT, 8787),
    provider,
    providerApiKey: apiKey && apiKey.length > 0 ? apiKey : undefined,
    providerRegion: env.TRANSLATION_PROVIDER_REGION?.trim() || undefined,
    providerEndpoint: env.TRANSLATION_PROVIDER_ENDPOINT?.trim() || undefined,
    maxTextLength: readInt(env.MAX_TEXT_LENGTH, 5000),
    maxBodyBytes: readInt(env.MAX_BODY_BYTES, 64 * 1024),
    providerTimeoutMs: readInt(env.PROVIDER_TIMEOUT_MS, 10_000),
    rateLimit: {
      max: readInt(env.RATE_LIMIT_MAX, 60),
      windowMs: readInt(env.RATE_LIMIT_WINDOW_MS, 60_000),
    },
    tutorApiKey: env.OPENAI_API_KEY?.trim() || undefined,
    tutorModel: env.TUTOR_MODEL?.trim() || 'gpt-4o-mini',
    tutorMaxTokens: readInt(env.TUTOR_MAX_TOKENS, 220),
    tutorRateLimit: {
      max: readInt(env.TUTOR_RATE_LIMIT_MAX, 20),
      windowMs: readInt(env.TUTOR_RATE_LIMIT_WINDOW_MS, 60 * 60_000),
    },
  };
}

/**
 * A one-line boot summary. Deliberately reports only whether a credential is
 * present, never any part of its value.
 */
export function describeConfig(config: ServerConfig): string {
  const credential = config.providerApiKey ? 'configured' : 'missing';
  return `provider=${config.provider} credential=${credential} port=${config.port}`;
}
