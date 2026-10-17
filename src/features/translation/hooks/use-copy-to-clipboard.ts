import { useCallback, useEffect, useRef, useState } from 'react';

import { services } from '@/services';

const FEEDBACK_MS = 1600;

export type CopyController = {
  copy: (text: string) => void;
  /** True briefly after a successful copy, for a confirming icon swap. */
  justCopied: boolean;
};

/**
 * Copy with transient confirmation. The clipboard itself is reached through
 * the service layer, so no component imports a platform API.
 */
export function useCopyToClipboard(): CopyController {
  const [justCopied, setJustCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => (timer.current ? clearTimeout(timer.current) : undefined), []);

  const copy = useCallback((text: string) => {
    if (!text) return;

    void services.clipboard.copy(text).then((result) => {
      if (!result.ok) return;
      services.analytics.log({ name: 'translation_copied' });
      setJustCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setJustCopied(false), FEEDBACK_MS);
    });
  }, []);

  return { copy, justCopied };
}
