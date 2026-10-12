import { Pressable, View } from 'react-native';

import { FlagCircle, Icon, Text } from '@/components';
import { getLanguage, languageName } from '@/constants';
import { useTheme } from '@/hooks';

/**
 * One course to choose: the language's flag, its name in the app's language,
 * and its own name under it. A radio, marked by border, fill and a check.
 */
export function CourseOption({
  courseId,
  selected,
  onPress,
}: {
  courseId: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const name = languageName(courseId);
  const native = getLanguage(courseId)?.nativeName;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={native && native !== name ? `${name}, ${native}` : name}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: theme.spacing.md,
        minHeight: theme.layout.minTouchTarget + theme.spacing.md,
        paddingHorizontal: theme.spacing.base,
        paddingVertical: theme.spacing.sm,
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
      <FlagCircle language={courseId} size={36} />
      <View style={{ flex: 1 }}>
        <Text variant="rowTitle" color={selected ? 'primaryStrong' : 'text'}>
          {name}
        </Text>
        {native && native !== name ? (
          <Text variant="bodySmall" color="textSecondary">
            {native}
          </Text>
        ) : null}
      </View>
      {selected ? <Icon name="checkmark-circle" size={22} color="primary" /> : null}
    </Pressable>
  );
}
