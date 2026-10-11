import type { NetworkStatus } from '@/services';
import type { TranslationMode } from '@/types';

export type WarmupCheck = {
  /** The user's translation mode. Offline-only has opted out of the server. */
  mode: TranslationMode;
  network: NetworkStatus;
  /** When the server was last pinged this session, if it has been. */
  lastWarmAt: number | undefined;
  now: number;
  /** The shortest gap between two pings. */
  intervalMs: number;
};

/**
 * Whether to wake the translation server right now.
 *
 * Not for someone who chose offline-only translation: they have opted out of
 * the server, and the app should not contact it on their behalf. Not with no
 * connection, where the request could only fail — an unknown connection is
 * still tried, since that is often the first moment after start-up, exactly
 * when waking matters most. And not again within `intervalMs` of the last
 * ping, so switching between apps does not send a stream of them.
 */
export function shouldWarmServer({
  mode,
  network,
  lastWarmAt,
  now,
  intervalMs,
}: WarmupCheck): boolean {
  if (mode === 'offline') return false;
  if (network === 'offline') return false;
  if (lastWarmAt !== undefined && now - lastWarmAt < intervalMs) return false;
  return true;
}
