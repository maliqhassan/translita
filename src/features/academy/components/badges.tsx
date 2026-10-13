import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Card, Icon, Text, type IconName } from '@/components';
import { useTheme } from '@/hooks';
import { msg, t } from '@/i18n';

import { BADGES, type BadgeId } from '../rules';

import { Pop } from './motion';

/** How each badge looks and reads. */
export const BADGE_INFO: Record<BadgeId, { icon: IconName; title: string; how: string }> = {
  'first-day': { icon: 'footsteps', title: msg('First steps'), how: msg('Finish your first day') },
  'streak-3': { icon: 'flame', title: msg('On a roll'), how: msg('Learn 3 days in a row') },
  'streak-7': { icon: 'flame', title: msg('Week warrior'), how: msg('Learn 7 days in a row') },
  'streak-30': { icon: 'bonfire', title: msg('Unstoppable'), how: msg('Learn 30 days in a row') },
  perfect: { icon: 'star', title: msg('Perfect day'), how: msg('Earn 3 stars on a day') },
  chapter: { icon: 'trophy', title: msg('Chapter champion'), how: msg('Pass a checkpoint') },
  halfway: { icon: 'flag', title: msg('Halfway there'), how: msg('Finish 30 days') },
  'words-50': { icon: 'book', title: msg('Word collector'), how: msg('Know 50 words') },
  'words-150': { icon: 'library', title: msg('Word master'), how: msg('Know 150 words') },
  graduate: { icon: 'school', title: msg('Graduate'), how: msg('Pass the final exam') },
};

const SIZE = 52;

function Medal({ badge, earned }: { badge: BadgeId; earned: boolean }) {
  const theme = useTheme();
  const info = BADGE_INFO[badge];
  return (
    <View
      accessible
      accessibilityLabel={
        earned
          ? t('{badge}, earned', { badge: t(info.title) })
          : t('{badge}: {how}', { badge: t(info.title), how: t(info.how) })
      }
      style={{ width: '20%', alignItems: 'center', gap: theme.spacing.xxs }}
    >
      <View
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 2,
          borderColor: earned ? theme.colors.flame : theme.colors.border,
          backgroundColor: earned ? theme.colors.warningMuted : theme.colors.surfaceMuted,
        }}
      >
        <Icon
          name={earned ? info.icon : 'lock-closed'}
          size={22}
          color={earned ? 'flame' : 'textMuted'}
        />
      </View>
      <Text
        variant="caption"
        color={earned ? 'text' : 'textMuted'}
        align="center"
        numberOfLines={2}
      >
        {t(info.title)}
      </Text>
    </View>
  );
}

/** Every badge, earned ones in colour: the dashboard's trophy shelf. */
export function BadgeShelf({ earned }: { earned: readonly BadgeId[] }) {
  const theme = useTheme();
  return (
    <Card variant="outlined" style={{ gap: theme.spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text variant="rowTitle" style={{ flex: 1 }}>
          {t('Your badges')}
        </Text>
        <Text variant="label" color="textSecondary">
          {t('{count} of {total}', { count: earned.length, total: BADGES.length })}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: theme.spacing.md }}>
        {BADGES.map((badge) => (
          <Medal key={badge} badge={badge} earned={earned.includes(badge)} />
        ))}
      </View>
    </Card>
  );
}

/** Badges just earned, celebrated on a lesson's result. */
export function NewBadges({ badges }: { badges: readonly BadgeId[] }) {
  const theme = useTheme();
  if (!badges.length) return null;
  return (
    <View style={{ alignSelf: 'stretch', gap: theme.spacing.sm }}>
      {badges.map((badge, index) => {
        const info = BADGE_INFO[badge];
        return (
          <Animated.View
            key={badge}
            entering={ZoomIn.delay(600 + index * 250).springify()}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: theme.spacing.md,
              padding: theme.spacing.base,
              borderRadius: theme.radius.lg,
              borderWidth: 2,
              borderColor: theme.colors.flame,
              backgroundColor: theme.colors.warningMuted,
            }}
          >
            <Pop active>
              <View
                style={{
                  width: SIZE,
                  height: SIZE,
                  borderRadius: SIZE / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: theme.colors.flame,
                }}
              >
                <Icon name={info.icon} size={26} color="textOnPrimary" />
              </View>
            </Pop>
            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <Text variant="overline" color="flame">
                {t('New badge!')}
              </Text>
              <Text variant="rowTitle">{t(info.title)}</Text>
              <Text variant="bodySmall" color="textSecondary">
                {t(info.how)}
              </Text>
            </View>
          </Animated.View>
        );
      })}
    </View>
  );
}
