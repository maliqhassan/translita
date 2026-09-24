import { createServer } from 'node:http';

import { describeConfig, loadConfig } from './config';
import { createRequestHandler } from './server';
import { createAzureProvider } from './translation/azure-provider';
import { createFakeProvider } from './translation/fake-provider';
import { createLanguageResolver, loadLanguageMap } from './translation/language-map';
import type { TranslationProvider } from './translation/provider';
import type { TutorProvider } from './tutor/contract';
import { createOpenAiTutor } from './tutor/openai-provider';

/**
 * Boots the Transee translation backend.
 *
 * The one place a concrete provider is chosen. Everything downstream depends
 * on the `TranslationProvider` interface, never on Azure.
 */

const config = loadConfig();
const languages = createLanguageResolver(loadLanguageMap());

function selectProvider(): TranslationProvider {
  if (config.provider === 'fake') return createFakeProvider();

  const azure = createAzureProvider({
    apiKey: config.providerApiKey,
    region: config.providerRegion,
    endpoint: config.providerEndpoint,
    timeoutMs: config.providerTimeoutMs,
  });

  if (!azure.isConfigured()) {
    // Refusing to start is better than serving 503s that look like an outage.
    console.error(
      'TRANSLATION_PROVIDER_API_KEY is not set. Set it, or run with TRANSLATION_PROVIDER=fake for local development.',
    );
    process.exit(1);
  }

  return azure;
}

/**
 * The tutor is optional.
 *
 * No credential means the endpoint answers `provider_unavailable` rather than
 * the process refusing to boot: translating is the product, and practice is
 * an extra. A deployment without an OpenAI key should still translate.
 */
function selectTutor(): TutorProvider | undefined {
  if (!config.tutorApiKey) return undefined;

  return createOpenAiTutor({
    apiKey: config.tutorApiKey,
    model: config.tutorModel,
    maxTokens: config.tutorMaxTokens,
  });
}

const provider = selectProvider();
const tutor = selectTutor();
const handler = createRequestHandler({ config, provider, languages, tutor });

const server = createServer((request, response) => {
  void handler(request, response).catch(() => {
    // A handler should never throw; if it does, fail closed and say nothing
    // that could describe the internals.
    if (!response.headersSent) {
      response.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    }
    response.end(
      JSON.stringify({ error: { code: 'internal_error', message: 'Unexpected error.' } }),
    );
  });
});

server.listen(config.port, () => {
  console.log(`Transee backend listening on :${config.port}`);
  console.log(describeConfig(config));
  console.log(`languages: ${languages.supportedIds().length} supported`);
  // Presence only, never the value, and never the model's own key.
  console.log(`tutor: ${tutor ? `enabled (${config.tutorModel})` : 'disabled'}`);
});
