import type { IncomingMessage, ServerResponse } from 'node:http';

import { handleAcademy, readUserId, type AcademyAction } from './academy/academy-handler';
import {
  createDailyAllowance,
  createRevenueCatChecker,
  type DailyAllowance,
  type EntitlementChecker,
} from './academy/access';
import type { AcademyProvider } from './academy/contract';
import type { ServerConfig } from './config';
import { apiError, statusFor } from './http/api-error';
import { readJsonBody, sendError, sendJson } from './http/json';
import { createRateLimiter, type RateLimiter } from './rate-limit';
import type { LanguageResolver } from './translation/language-map';
import type { TranslationProvider } from './translation/provider';
import { handleTranslate } from './translation/translate-handler';
import type { TutorProvider } from './tutor/contract';
import { handleTutor } from './tutor/tutor-handler';

export type RequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export type CreateHandlerOptions = {
  config: ServerConfig;
  provider: TranslationProvider;
  languages: LanguageResolver;
  rateLimiter?: RateLimiter;
  /** Absent when the deployment has no tutor credential. */
  tutor?: TutorProvider;
  tutorRateLimiter?: RateLimiter;
  /** Absent when the deployment has no OpenAI credential. */
  academy?: AcademyProvider;
  academyRateLimiter?: RateLimiter;
  /** Defaults to RevenueCat, configured from `config`. */
  entitlements?: EntitlementChecker;
  allowance?: DailyAllowance;
};

/** The Academy's endpoints: a lesson's role-play, and the final exam's marking and report. */
const ACADEMY_ROUTES: Readonly<Record<string, AcademyAction | undefined>> = {
  'POST /academy/roleplay': 'roleplay',
  'POST /academy/assess': 'assess',
  'POST /academy/report': 'report',
};

/**
 * Identifies a caller for rate limiting.
 *
 * `x-forwarded-for` is honoured because the service is expected to sit behind
 * a proxy, but it is client-controlled and therefore only ever used as a
 * bucketing hint — never for auth or anything security-bearing.
 */
function clientKey(request: IncomingMessage): string {
  const forwarded = request.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(',')[0];
  return first?.trim() || request.socket.remoteAddress || 'unknown';
}

export function createRequestHandler(options: CreateHandlerOptions): RequestHandler {
  const { config, provider, languages, tutor } = options;
  const limiter =
    options.rateLimiter ??
    createRateLimiter({ max: config.rateLimit.max, windowMs: config.rateLimit.windowMs });

  // Its own bucket. Sharing translation's would let a burst of practice
  // exhaust the allowance for translating, which is the free feature.
  const tutorLimiter =
    options.tutorRateLimiter ??
    createRateLimiter({
      max: config.tutorRateLimit.max,
      windowMs: config.tutorRateLimit.windowMs,
    });

  const academyLimiter =
    options.academyRateLimiter ??
    createRateLimiter({
      max: config.academyRateLimit.max,
      windowMs: config.academyRateLimit.windowMs,
    });
  const entitlements =
    options.entitlements ??
    createRevenueCatChecker({
      secretKey: config.revenueCatSecretKey,
      entitlement: config.academyEntitlement,
    });
  const allowance =
    options.allowance ??
    createDailyAllowance({ free: config.academyFreeDaily, academy: config.academyEliteDaily });

  return async function handle(request, response) {
    const url = new URL(request.url ?? '/', 'http://localhost');
    const route = `${request.method ?? 'GET'} ${url.pathname}`;

    // Liveness, and a way to confirm which provider a deployment is running
    // without revealing whether or how it is credentialed.
    if (route === 'GET /health') {
      sendJson(response, 200, { status: 'ok', provider: languages.provider });
      return;
    }

    // Lets a client discover what the deployed provider actually supports.
    if (route === 'GET /languages') {
      sendJson(response, 200, {
        provider: languages.provider,
        languages: languages.supportedIds(),
      });
      return;
    }

    if (route === 'POST /tutor') {
      const practice = tutorLimiter.check(clientKey(request));
      if (!practice.allowed) {
        response.setHeader('Retry-After', String(practice.retryAfterSeconds));
        sendError(response, apiError('rate_limited', 'Too many practice requests.'));
        return;
      }

      const body = await readJsonBody(request, config.maxBodyBytes);
      if (!body.ok) {
        sendError(response, body.error);
        return;
      }

      await handleTutor(response, tutor, body.value);
      return;
    }

    const academyAction = ACADEMY_ROUTES[route];
    if (academyAction) {
      const caller = clientKey(request);
      const limit = academyLimiter.check(caller);
      if (!limit.allowed) {
        response.setHeader('Retry-After', String(limit.retryAfterSeconds));
        sendError(response, apiError('rate_limited', 'Too many practice requests.'));
        return;
      }

      const body = await readJsonBody(request, config.maxBodyBytes);
      if (!body.ok) {
        sendError(response, body.error);
        return;
      }

      const userId = readUserId(request.headers['x-app-user-id']);
      await handleAcademy(academyAction, response, body.value, {
        provider: options.academy,
        entitlements,
        allowance,
        // Without an id, the allowance is per address instead.
        userKey: userId ? `user:${userId}` : `ip:${caller}`,
        userId,
      });
      return;
    }

    if (route !== 'POST /translation') {
      const code = url.pathname === '/translation' ? 'invalid_request' : 'not_found';
      sendError(
        response,
        apiError(code, code === 'not_found' ? 'Unknown endpoint.' : 'Use POST for this endpoint.'),
      );
      return;
    }

    const limit = limiter.check(clientKey(request));
    if (!limit.allowed) {
      response.setHeader('Retry-After', String(limit.retryAfterSeconds));
      sendError(response, apiError('rate_limited', 'Too many requests. Please slow down.'));
      return;
    }

    const body = await readJsonBody(request, config.maxBodyBytes);
    if (!body.ok) {
      sendError(response, body.error);
      return;
    }

    const result = await handleTranslate(body.value, {
      provider,
      languages,
      maxTextLength: config.maxTextLength,
    });

    if (!result.ok) {
      sendError(response, result.error);
      return;
    }

    sendJson(response, 200, result.value);
  };
}

export { statusFor };
