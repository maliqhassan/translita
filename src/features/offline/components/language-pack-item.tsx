import { ActivityIndicator, View } from 'react-native';

import { Badge, IconButton, ListItem, Text } from '@/components';
import type { BadgeTone } from '@/components';
import { useTheme } from '@/hooks';
import type { LanguagePack, LanguagePackState } from '@/services';

export type LanguagePackItemProps = {
  pack: LanguagePack;
  onDownload?: (pack: LanguagePack) => void;
  onRemove?: (pack: LanguagePack) => void;
};

const STATE_TONE = {
  not_downloaded: 'neutral',
  downloading: 'primary',
  removing: 'warning',
  ready: 'success',
  failed: 'danger',
} as const satisfies Record<LanguagePackState, BadgeTone>;

const STATE_LABEL = {
  not_downloaded: 'Not downloaded',
  downloading: 'Downloading',
  removing: 'Removing',
  ready: 'Downloaded',
  failed: 'Failed',
} as const satisfies Record<LanguagePackState, string>;

/**
 * One language's on-device model.
 *
 * A pack is a language, not a pair — downloading English and German is what
 * makes both directions between them work. The subtitle is the endonym rather
 * than a download size: the runtime does not report sizes, so there is no
 * number here to show.
 *
 * Exactly one control is offered at a time, decided by the state alone, so the
 * row can never show a download button for something already downloaded or a
 * delete button for something absent.
 */
export function LanguagePackItem({ pack, onDownload, onRemove }: LanguagePackItemProps) {
  const theme = useTheme();
  const busy = pack.state === 'downloading' || pack.state === 'removing';
  const ready = pack.state === 'ready';
  const failed = pack.state === 'failed';

  /**
   * The one control this row offers, or none.
   *
   * A caller that omits `onDownload` — because the plan does not include
   * on-device translation — gets no download button rather than a dead one.
   * Removal is passed separately and stays available either way.
   */
  const action = ready ? onRemove : onDownload;

  return (
    <ListItem
      icon={ready ? 'checkmark-circle-outline' : 'cloud-download-outline'}
      title={pack.name}
      subtitle={failed ? 'Download failed — tap to try again' : pack.nativeName}
      showChevron={false}
      trailing={
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
          <Badge label={STATE_LABEL[pack.state]} tone={STATE_TONE[pack.state]} />

          {busy ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
              <ActivityIndicator color={theme.colors.primary} />
              {/* Announced, not just spun, so the state is not colour-only. */}
              <Text variant="caption" color="textMuted" accessibilityLiveRegion="polite">
                {STATE_LABEL[pack.state]}
              </Text>
            </View>
          ) : action ? (
            <IconButton
              name={ready ? 'trash-outline' : failed ? 'refresh-outline' : 'cloud-download-outline'}
              accessibilityLabel={
                ready
                  ? `Remove the ${pack.name} pack`
                  : failed
                    ? `Retry downloading the ${pack.name} pack`
                    : `Download the ${pack.name} pack`
              }
              onPress={() => action(pack)}
            />
          ) : null}
        </View>
      }
    />
  );
}
