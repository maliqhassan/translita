import { Pressable } from 'react-native';

import { FlagCircle, Icon, Text } from '@/components';
import { getLanguage } from '@/constants';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';
import type { LanguageField } from '@/store';
import type { LanguageId } from '@/types';

export type LanguageSelectPillProps = {
  field: LanguageField;
  id: LanguageId;
  onPress: () => void;
};

const FIELD_LABEL: Record<LanguageField, string> = { source: msg('From'), target: msg('To') };

/**
 * One side of the pair: the language's flag and name, in the brand blue, on
 * its pale fill — the familiar translator's language button. Which side it is
 * follows from where it sits (left translates into right, as the swap arrows
 * between them say), and is spoken to screen readers as "From" or "To".
 */
export function LanguageSelectPill({ field, id, onPress }: LanguageSelectPillProps) {
  const theme = useTheme();
  const name = getLanguage(id)?.name ?? id;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${t(FIELD_LABEL[field])}: ${name}`}
      accessibilityHint={
        field === 'source'
          ? t('Choose a different source language')
          : t('Choose a different target language')
      }
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: theme.spacing.xs,
        minHeight: theme.layout.minTouchTarget + theme.spacing.xs,
        paddingLeft: theme.spacing.xs,
        paddingRight: theme.spacing.md,
        borderRadius: theme.radius.full,
        backgroundColor: theme.colors.primaryMuted,
        opacity: pressed ? theme.motion.opacityPressed : 1,
        transform: [{ scale: pressed ? theme.motion.scalePressed : 1 }],
      })}
    >
      {/* The flag as a quick visual cue; the name beside it is what counts. */}
      <FlagCircle language={id} size={28} />
      <Text
        variant="button"
        color="primary"
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={{ flexShrink: 1 }}
      >
        {name}
      </Text>
      <Icon name="chevron-down" size={14} color="primary" />
    </Pressable>
  );
}
