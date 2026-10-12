import type { Service, ServiceResult } from '../types';

/**
 * Sharing a picture of part of the screen — the Academy's certificate — through
 * the phone's own share sheet. Behind an interface, so no screen touches the
 * capture or sharing APIs and both can be stubbed in tests.
 */
export type ShareService = Service & {
  /**
   * Captures the view and opens the share sheet with it as an image.
   *
   * `view` is what a ref to a React Native view holds. Backing out of the
   * share sheet is not a failure.
   */
  shareView(view: unknown, title: string): ServiceResult<void>;
};
