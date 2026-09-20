import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks';

import { Icon, type IconName } from '../ui/icon';
import { Text } from '../ui/text';

/**
 * The bottom navigation: a floating rounded bar rather than a full-width strip.
 *
 * Written by hand instead of styling the default one because the two things
 * that make it feel finished — insetting it from the screen edges, and drawing
 * a pill behind the selected tab — are not things the built-in bar exposes.
 *
 * Everything the default bar does for accessibility is kept: each tab is a
 * button that announces its selected state and its label, long press still
 * emits, and a press on the tab you are already on is still cancellable by a
 * listener rather than assumed to be a navigation.
 *
 * The bottom inset is honoured by the wrapper, so on a phone with gesture
 * navigation or three buttons the bar floats above them instead of underneath.
 */

/** The icon pair for a route, keyed by the file name of the tab. */
export type TabIcons = Readonly<Record<string, { inactive: IconName; active: IconName }>>;

export type AppTabBarProps = BottomTabBarProps & {
  icons: TabIcons;
};

export function AppTabBar({ state, descriptors, navigation, icons }: AppTabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={{
        /*
         * Deliberately *not* absolutely positioned. A floating overlay would
         * let scrolled content run underneath it, which is the bug this app
         * just fixed for the old bar. Laid out in the normal flow, the
         * navigator measures this wrapper and reserves the space, and the
         * inset padding keeps the pill clear of the system navigation.
         */
        /*
         * A floor under the inset, not just the inset.
         *
         * A phone with three-button navigation in its own strip reports an
         * inset of zero, which left the bar sitting right on the system
         * buttons. Gesture phones report a real inset and need no extra.
         *
         * The floor is a layout token rather than a spacing step because it is
         * measuring clearance from hardware, not expressing rhythm: it wants to
         * be tuned against a real phone, and 12pt was not enough to keep the
         * pill off the back/home/recents keys.
         */
        paddingBottom: Math.max(insets.bottom, theme.layout.tabBarFloorInset),
        paddingHorizontal: theme.spacing.base,
        paddingTop: theme.spacing.sm,
        backgroundColor: theme.colors.background,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-around',
          // Enough that the selected pill sits inside the bar rather than
          // against its border, which is what made the old bar look cramped.
          paddingVertical: theme.spacing.xs,
          paddingHorizontal: theme.spacing.xs,
          borderRadius: theme.radius.full,
          backgroundColor: theme.colors.tabBar,
          borderWidth: 1,
          borderColor: theme.colors.tabBarBorder,
          ...theme.shadows.lg,
        }}
      >
        {state.routes.map((route, index) => {
          const { options } = descriptors[route.key] ?? {};
          const isFocused = state.index === index;

          const label = typeof options?.title === 'string' ? options.title : (route.name ?? '');
          const icon = icons[route.name];

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            // A listener may cancel it — that is how "scroll to top on the tab
            // you are already on" works — so this is not assumed.
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <TabItem
              key={route.key}
              label={label}
              iconName={icon ? (isFocused ? icon.active : icon.inactive) : 'ellipse-outline'}
              isFocused={isFocused}
              accessibilityLabel={options?.tabBarAccessibilityLabel ?? label}
              onPress={onPress}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
            />
          );
        })}
      </View>
    </View>
  );
}

type TabItemProps = {
  label: string;
  iconName: IconName;
  isFocused: boolean;
  accessibilityLabel: string;
  onPress: () => void;
  onLongPress: () => void;
};

/**
 * One tab. The pill grows in behind the selected one rather than appearing,
 * which makes the change of tab readable as movement instead of a flash.
 */
function TabItem({
  label,
  iconName,
  isFocused,
  accessibilityLabel,
  onPress,
  onLongPress,
}: TabItemProps) {
  const theme = useTheme();
  const scale = useSharedValue(isFocused ? 1 : 0.9);

  useEffect(() => {
    scale.value = withSpring(isFocused ? 1 : 0.9, { damping: 16, stiffness: 220 });
  }, [isFocused, scale]);

  const pillStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: theme.layout.minTouchTarget,
        paddingVertical: theme.spacing.xxs,
        opacity: pressed ? theme.motion.opacityPressed : 1,
      })}
    >
      <Animated.View
        style={[
          pillStyle,
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: theme.spacing.xs,
            paddingVertical: theme.spacing.xs,
            paddingHorizontal: isFocused ? theme.spacing.md : theme.spacing.sm,
            borderRadius: theme.radius.full,
            backgroundColor: isFocused ? theme.colors.primaryMuted : 'transparent',
          },
        ]}
      >
        <Icon
          name={iconName}
          size={theme.layout.tabIconSize}
          color={isFocused ? 'primary' : 'tabBarInactive'}
        />

        {/* The label rides beside the icon only on the selected tab, which
            keeps the bar quiet without hiding what anything is. */}
        {isFocused ? (
          <Text variant="caption" color="primary" numberOfLines={1}>
            {label}
          </Text>
        ) : null}
      </Animated.View>
    </Pressable>
  );
}
