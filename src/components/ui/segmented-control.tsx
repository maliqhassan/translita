import { Pressable, View, type ViewStyle } from 'react-native';

import { useTheme } from '@/hooks';

import { Text } from './text';

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Rendered on the header gradient rather than the app background. */
  onGradient?: boolean;
  accessibilityLabel?: string;
  style?: ViewStyle;
};

/**
 * A small two-or-more way switch.
 *
 * Built rather than pulled in: it is a track, a pill and some labels, and the
 * whole point is that it uses the app's own tokens in both themes and on the
 * header gradient. A library would have brought its own.
 *
 * Each segment is a real button with `selected` state, so a screen reader
 * announces the choice rather than just the word.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  onGradient = false,
  accessibilityLabel,
  style,
}: SegmentedControlProps<T>) {
  const theme = useTheme();

  // White on the page, so the track reads against the mist background.
  const track = onGradient ? theme.colors.onGradientMuted : theme.colors.surface;
  const selectedBackground = onGradient ? theme.colors.onGradient : theme.colors.primary;

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          flexDirection: 'row',
          padding: theme.spacing.xxs,
          borderRadius: theme.radius.full,
          backgroundColor: track,
          borderWidth: onGradient ? 0 : theme.layout.borderWidth,
          borderColor: theme.colors.border,
        },
        style,
      ]}
    >
      {options.map((option) => {
        const isSelected = option.value === value;

        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={option.label}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: theme.layout.minTouchTarget - theme.spacing.sm,
              paddingHorizontal: theme.spacing.md,
              borderRadius: theme.radius.full,
              backgroundColor: isSelected ? selectedBackground : 'transparent',
              opacity: pressed && !isSelected ? theme.motion.opacityPressed : 1,
            })}
          >
            <Text
              variant="caption"
              color={
                isSelected
                  ? onGradient
                    ? 'primary'
                    : 'textOnPrimary'
                  : onGradient
                    ? 'onGradient'
                    : 'textSecondary'
              }
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
