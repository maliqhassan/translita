import { Pressable, View } from 'react-native';

import { FlagCircle, Icon, Text } from '@/components';
import { useTheme } from '@/hooks';
import { APP_LANGUAGES, type AppLanguageCode } from '@/i18n';

/**
 * The languages the app can speak, as a list of choices.
 *
 * Shared by the first onboarding screen and Settings, so the choice looks the
 * same both times. Each row has the language's flag, then its own name — a speaker
 * looks for "اردو", not "Urdu" — and gives the English name under it.
 */
export function AppLanguageList({
  selected,
  onSelect,
  exclude = [],
}: {
  /** Nothing is marked when undefined. */
  selected: AppLanguageCode | undefined;
  onSelect: (code: AppLanguageCode) => void;
  /** Languages not to offer here. */
  exclude?: readonly AppLanguageCode[];
}) {
  const theme = useTheme();

  return (
    <View style={{ gap: theme.spacing.sm }} accessibilityRole="radiogroup">
      {APP_LANGUAGES.filter((item) => !exclude.includes(item.code)).map((item) => {
        const active = item.code === selected;
        return (
          <Pressable
            key={item.code}
            onPress={() => onSelect(item.code)}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${item.nativeName}, ${item.name}`}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              minHeight: theme.layout.minTouchTarget + theme.spacing.md,
              paddingHorizontal: theme.spacing.base,
              borderRadius: theme.radius.lg,
              borderWidth: theme.layout.borderWidth,
              borderColor: active ? theme.colors.primary : theme.colors.border,
              backgroundColor: active
                ? theme.colors.primaryMuted
                : pressed
                  ? theme.colors.surfaceMuted
                  : theme.colors.surface,
            })}
          >
            <FlagCircle language={item.languageId} size={32} />
            <View style={{ flex: 1 }}>
              <Text variant="rowTitle" color={active ? 'primaryStrong' : 'text'}>
                {item.nativeName}
              </Text>
              {item.nativeName !== item.name ? (
                <Text variant="bodySmall" color="textSecondary">
                  {item.name}
                </Text>
              ) : null}
            </View>
            {active ? <Icon name="checkmark-circle" size={22} color="primary" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
