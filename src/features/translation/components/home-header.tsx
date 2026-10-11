import { View } from 'react-native';

import { Icon, ScreenHeader } from '@/components';
import { APP } from '@/constants';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

import { BrandMark } from './brand-mark';
import { HomeActions } from './home-actions';

export type HomeHeaderProps = {
  /**
   * Whether the current pair would translate on this device right now.
   *
   * Shown as a small cloud-with-a-tick beside the name only when true — the
   * same mark the language list uses for a downloaded language. It sits on
   * the name's line: as a second line underneath, it pushed the name up and
   * out of line with the logo.
   */
  offlineReady: boolean;
  onOpenUpgrade: () => void;
  onOpenSettings: () => void;
};

/**
 * The logo and name on the left; Pro and settings on the right.
 *
 * The same header as every other tab, so the logo and the name beside it sit
 * on exactly the same line, at the same size, wherever the user is.
 */
export function HomeHeader({ offlineReady, onOpenUpgrade, onOpenSettings }: HomeHeaderProps) {
  const theme = useTheme();

  return (
    // Extra room before the language bar, so the header reads as the top of
    // the page rather than as part of the translator below it.
    <View style={{ paddingBottom: theme.spacing.md }}>
      <ScreenHeader
        compact
        title={APP.name}
        leading={<BrandMark />}
        titleAccessory={
          offlineReady ? (
            <View accessible accessibilityLabel={t('Offline ready')}>
              <Icon name="cloud-done-outline" size={18} color="primary" />
            </View>
          ) : null
        }
        actions={<HomeActions onOpenUpgrade={onOpenUpgrade} onOpenSettings={onOpenSettings} />}
      />
    </View>
  );
}
