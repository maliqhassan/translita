import type { ReactNode } from 'react';
import { View } from 'react-native';

import { useTheme } from '@/hooks';

import { Text } from './text';

export type SectionHeaderProps = {
  title: string;
  description?: string;
  /** Trailing slot for a "See all" style action. */
  action?: ReactNode;
};

export function SectionHeader({ title, description, action }: SectionHeaderProps) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: theme.spacing.md,
        marginBottom: theme.spacing.md,
      }}
    >
      <View style={{ flex: 1, gap: theme.spacing.xxs }}>
        <Text variant="sectionLabel" color="textSecondary">
          {title.toUpperCase()}
        </Text>
        {description ? (
          <Text variant="bodySmall" color="textMuted">
            {description}
          </Text>
        ) : null}
      </View>
      {action}
    </View>
  );
}
