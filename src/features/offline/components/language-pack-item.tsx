import { ActivityIndicator, View } from 'react-native';

import { FlagCircle, IconButton, Text, type IconName } from '@/components';
import type { ColorTokens } from '@/constants';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import type { LanguagePack, LanguagePackState } from '@/services';

export type LanguagePackItemProps = {
  pack: LanguagePack;
  onDownload?: (pack: LanguagePack) => void;
  onRemove?: (pack: LanguagePack) => void;
  /** Drawn with a soft fill, for a language in the pair currently in use. */
  highlighted?: boolean;
};

/** Spoken while the spinner turns, so the state is never colour or motion alone. */
const BUSY_LABEL = {
  downloading: msg('Downloading'),
  removing: msg('Removing'),
} as const satisfies Partial<Record<LanguagePackState, string>>;

/**
 * One language's on-device model: its flag, its name, and one control.
 *
 * A pack is a language, not a pair — downloading English and German is what
 * makes both directions between them work. There is no size or progress: the
 * runtime reports neither, so there is nothing true to show.
 *
 * Exactly one control is offered at a time, decided by the state alone: a
 * cloud to download, a green tick once downloaded (tapping it offers to
 * remove), a retry after a failure, or a spinner while busy. The row can never
 * show a download button for something already downloaded or a delete button
 * for something absent.
 */
export function LanguagePackItem({
  pack,
  onDownload,
  onRemove,
  highlighted = false,
}: LanguagePackItemProps) {
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

  const control: { icon: IconName; color: keyof ColorTokens; label: string } = ready
    ? {
        icon: 'checkmark-circle-outline',
        color: 'success',
        label: t('Remove the {language} pack', { language: t(pack.name) }),
      }
    : failed
      ? {
          icon: 'refresh-outline',
          color: 'warning',
          label: t('Retry downloading the {language} pack', { language: t(pack.name) }),
        }
      : {
          icon: 'cloud-download-outline',
          color: 'text',
          label: t('Download the {language} pack', { language: t(pack.name) }),
        };

  return (
    <View
      accessibilityLabel={`${t(pack.name)}, ${ready ? t('downloaded') : failed ? t('download failed') : t('not downloaded')}`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.layout.minTouchTarget + theme.spacing.xs,
        paddingLeft: theme.spacing.md,
        paddingRight: theme.spacing.xs,
        borderRadius: theme.radius.lg,
        backgroundColor: highlighted ? theme.colors.primaryMuted : 'transparent',
      }}
    >
      <FlagCircle language={pack.language} />

      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="body" numberOfLines={1} maxFontSizeMultiplier={1.4}>
          {t(pack.name)}
        </Text>
        {failed ? (
          <Text variant="caption" color="warning" numberOfLines={1}>
            {t('Download failed — tap to try again')}
          </Text>
        ) : null}
      </View>

      {busy ? (
        <View
          style={{
            width: theme.layout.minTouchTarget,
            height: theme.layout.minTouchTarget,
            alignItems: 'center',
            justifyContent: 'center',
          }}
          accessibilityLabel={`${t(BUSY_LABEL[pack.state as keyof typeof BUSY_LABEL])} ${t(pack.name)}`}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={theme.colors.primary} />
        </View>
      ) : action ? (
        <IconButton
          name={control.icon}
          color={control.color}
          size={22}
          accessibilityLabel={control.label}
          onPress={() => action(pack)}
        />
      ) : null}
    </View>
  );
}
