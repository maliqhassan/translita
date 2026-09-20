import { Platform, StyleSheet } from 'react-native';

export const layout = {
  /** Horizontal gutter used by every screen. */
  screenPadding: 20,
  /** Android/iOS minimum comfortable tap target. */
  minTouchTarget: 44,
  hairline: StyleSheet.hairlineWidth,
  borderWidth: 1,
  tabBarHeight: Platform.select({ ios: 56, default: 60 }),
  /** Glyph size in the bottom navigation. */
  tabIconSize: 22,
  /**
   * Clearance below the tab bar on a phone that reports no bottom inset.
   *
   * Three-button navigation lives in its own strip and reports an inset of
   * zero, so the bar is only as clear of the back/home/recents keys as this
   * makes it. Gesture phones report a real inset, which is larger and wins.
   */
  tabBarFloorInset: 24,
  maxContentWidth: 720,
  /** Extra touch area for small icon-only controls. */
  iconHitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;

export const motion = {
  duration: { instant: 90, fast: 150, normal: 220, slow: 320 },
  /** Kept as plain numbers so both Reanimated and Animated can consume them. */
  scalePressed: 0.97,
  opacityPressed: 0.85,
  opacityDisabled: 0.45,
} as const;
