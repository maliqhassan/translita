import { Pressable, View } from 'react-native';

import { Icon, Text, type IconName } from '@/components';
import { useTheme } from '@/hooks';

/**
 * One answer to an onboarding question: an icon, a title and a line under it.
 *
 * A radio: the whole card is the target, and the selected one is marked by
 * border, fill and a check — never by colour alone.
 */
export function OptionCard({
  icon,
  title,
  description,
  selected,
  onPress,
}: {
  icon: IconName;
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={description ? `${title}, ${description}` : title}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        padding: theme.spacing.base,
        borderRadius: theme.radius.lg,
        borderWidth: theme.layout.borderWidth,
        borderColor: selected ? theme.colors.primary : theme.colors.border,
        backgroundColor: selected
          ? theme.colors.primaryMuted
          : pressed
            ? theme.colors.surfaceMuted
            : theme.colors.surface,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: selected ? theme.colors.surface : theme.colors.primaryMuted,
        }}
      >
        <Icon name={icon} size={20} color="primary" />
      </View>
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="rowTitle" color={selected ? 'primaryStrong' : 'text'}>
          {title}
        </Text>
        {description ? (
          <Text variant="bodySmall" color="textSecondary">
            {description}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="checkmark-circle" size={22} color="primary" /> : null}
    </Pressable>
  );
}
