import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/hooks';

import { Text } from '../ui/text';

export type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  /** Leading slot, e.g. a brand mark or a back affordance. */
  leading?: ReactNode;
  /**
   * Drawn on the title's own line, straight after it — a small status icon,
   * say. Kept on that line so it can never push the title off the logo's.
   */
  titleAccessory?: ReactNode;
  /** Trailing controls, e.g. an IconButton. */
  actions?: ReactNode;
  /**
   * The tab header: the title in the same type as the app name on Home, so
   * the logo and the words beside it look identical on every tab.
   */
  compact?: boolean;
};

/**
 * Large in-page title used instead of a native navigation bar on tab roots.
 *
 * The row is one fixed height on every page — a touch target tall — and
 * everything in it is centred on that line. It used to take the height of
 * whatever was tallest, so a tab with a 44pt button sat its logo and title
 * lower than a tab without one, and the header visibly shifted on every tab
 * change.
 */
export function ScreenHeader({
  title,
  subtitle,
  leading,
  titleAccessory,
  actions,
  compact = false,
}: ScreenHeaderProps) {
  const theme = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        // On the row itself, not the padded box: a minimum height in React
        // Native includes padding, which would eat into the line.
        minHeight: theme.layout.minTouchTarget,
        marginTop: theme.spacing.sm,
        marginBottom: compact ? theme.spacing.md : theme.spacing.base,
      }}
    >
      {leading}
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          <Text
            variant={compact ? 'brandTitle' : 'h1'}
            numberOfLines={1}
            maxFontSizeMultiplier={compact ? 1.25 : 1.4}
            // Android pads text above the ascender by default, which sits the
            // letters visibly below the centre of the logo beside them.
            style={{ flexShrink: 1, includeFontPadding: false }}
          >
            {title}
          </Text>
          {titleAccessory}
        </View>
        {subtitle ? (
          <Text variant="bodySmall" color="textSecondary" numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {actions ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs }}>
          {actions}
        </View>
      ) : null}
    </View>
  );
}
