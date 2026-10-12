import * as Sharing from 'expo-sharing';
import { captureRef } from 'react-native-view-shot';

import { appError, createLogger, err, ok } from '@/utils';

import type { ShareService } from './share-service';

const log = createLogger('sharing');

/**
 * Captures with react-native-view-shot and shares with expo-sharing. The only
 * file in the app that imports either.
 */
export const expoShareService: ShareService = {
  id: 'sharing',

  async isAvailable() {
    try {
      return await Sharing.isAvailableAsync();
    } catch {
      return false;
    }
  },

  async shareView(view, title) {
    try {
      const uri = await captureRef(view as Parameters<typeof captureRef>[0], {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: title,
        UTI: 'public.png',
      });
      return ok(undefined);
    } catch (cause) {
      log.warn('could not share the picture');
      return err(appError('unknown', 'The picture could not be shared.', cause));
    }
  },
};
