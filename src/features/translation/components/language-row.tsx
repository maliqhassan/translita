import { memo, useCallback } from 'react';
import { Pressable, View } from 'react-native';

import { Badge, FlagCircle, Icon, Text } from '@/components';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import type { LanguagePackState } from '@/services';
import type { Language, LanguageId } from '@/types';

export type LanguageRowProps = {
  language: Language;
  /** True when this is the language currently set for the side being picked. */
  isSelected: boolean;
  /**
   * Set when this language is currently on the *other* side of the pair.
   * Choosing it swaps the two, and the badge says so before the tap.
   */
  otherSideLabel?: 'Source' | 'Target';
  /**
   * What the on-device runtime has for this language, when it knows.
   *
   * Undefined means the runtime cannot serve it at all, or there is no runtime
   * in this build — which is not the same as "not downloaded", so no icon is
   * drawn rather than a misleading one.
   */
  packState?: LanguagePackState;
  onSelect: (id: LanguageId) => void;
};

/**
 * Offline status, kept quiet so it never competes with the language name.
 * Blue for what the user has, muted for what they could get; red only for a
 * failure, which is worth noticing.
 */
const PACK_ICON = {
  ready: { name: 'cloud-done-outline', color: 'primary', label: msg('downloaded for offline use') },
  not_downloaded: {
    name: 'cloud-download-outline',
    color: 'textMuted',
    label: msg('available to download'),
  },
  downloading: { name: 'arrow-down-circle-outline', color: 'primary', label: msg('downloading') },
  removing: { name: 'trash-outline', color: 'textMuted', label: msg('being removed') },
  failed: { name: 'alert-circle-outline', color: 'danger', label: msg('download failed') },
} as const satisfies Record<LanguagePackState, { name: string; color: string; label: string }>;

/**
 * One row of the language list: the flag, the name with its own name in its
 * own language beneath, and what applies — the other side of the pair,
 * offline status, and a tick on the one currently chosen.
 *
 * The chosen row sits on the brand's pale blue, so it can be found at a
 * glance in a list of a hundred.
 *
 * Memoised, and it takes primitives plus a stable `onSelect`, so scrolling a
 * hundred-language catalogue does not re-render rows that have not changed.
 */
function LanguageRowComponent({
  language,
  isSelected,
  otherSideLabel,
  packState,
  onSelect,
}: LanguageRowProps) {
  const theme = useTheme();
  const handlePress = useCallback(() => onSelect(language.id), [onSelect, language.id]);

  const showNativeName = language.nativeName !== language.name;

  const pack = packState ? PACK_ICON[packState] : undefined;

  const label = [
    t(language.name),
    showNativeName ? language.nativeName : undefined,
    otherSideLabel === 'Source'
      ? t('currently the source language')
      : otherSideLabel === 'Target'
        ? t('currently the target language')
        : undefined,
    pack ? t(pack.label) : undefined,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <Pressable
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isSelected }}
      accessibilityHint={
        otherSideLabel ? t('Selecting this swaps the two languages') : t('Selects this language')
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.layout.minTouchTarget + theme.spacing.md,
        // Inset so the highlight has rounded ends; the flag still lines up
        // with the header's 20pt margin (12 outside + 8 inside).
        marginHorizontal: theme.spacing.md,
        paddingHorizontal: theme.spacing.sm,
        paddingVertical: theme.spacing.sm,
        borderRadius: theme.radius.lg,
        backgroundColor: isSelected
          ? theme.colors.primaryMuted
          : pressed
            ? theme.colors.surfaceMuted
            : 'transparent',
      })}
    >
      <FlagCircle language={language.id} size={36} />

      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text
          variant="rowTitle"
          color={isSelected ? 'primary' : 'text'}
          numberOfLines={1}
          maxFontSizeMultiplier={1.4}
        >
          {t(language.name)}
        </Text>
        {showNativeName ? (
          <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {language.nativeName}
          </Text>
        ) : null}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
        {otherSideLabel ? <Badge label={t(otherSideLabel)} tone="primary" /> : null}

        {/* Offline availability, straight from the runtime. */}
        {pack ? <Icon name={pack.name} size={18} color={pack.color} /> : null}

        {isSelected ? <Icon name="checkmark-circle" size={22} color="primary" /> : null}
      </View>
    </Pressable>
  );
}

export const LanguageRow = memo(LanguageRowComponent);
