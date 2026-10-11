import { TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/hooks';
import { t } from '@/i18n';

import { Icon } from './icon';
import { IconButton } from './icon-button';

export type SearchFieldProps = Omit<TextInputProps, 'style'> & {
  value: string;
  onChangeText: (text: string) => void;
  /** Shown as a clear button whenever there is a query. */
  onClear: () => void;
  placeholder?: string;
  accessibilityLabel?: string;
};

/**
 * A search input with a leading glyph and a trailing clear button. Kept as a
 * primitive rather than assembled per screen so every search bar in the app
 * has the same height, radius and clear affordance.
 */
export function SearchField({
  value,
  onChangeText,
  onClear,
  placeholder = t('Search'),
  accessibilityLabel = t('Search'),
  ...rest
}: SearchFieldProps) {
  const theme = useTheme();
  const hasQuery = value.length > 0;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.sm,
        paddingLeft: theme.spacing.base,
        paddingRight: hasQuery ? theme.spacing.xxs : theme.spacing.base,
        borderRadius: theme.radius.md,
        borderWidth: theme.layout.borderWidth,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
        minHeight: theme.layout.minTouchTarget,
      }}
    >
      <Icon name="search-outline" size={17} color="textMuted" />

      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textMuted}
        selectionColor={theme.colors.primary}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        clearButtonMode="never"
        accessibilityLabel={accessibilityLabel}
        style={[
          theme.typography.variants.body,
          { flex: 1, paddingVertical: theme.spacing.sm, color: theme.colors.text },
        ]}
        {...rest}
      />

      {hasQuery ? (
        <IconButton
          name="close-circle"
          size={18}
          accessibilityLabel={t('Clear search')}
          onPress={onClear}
        />
      ) : null}
    </View>
  );
}
