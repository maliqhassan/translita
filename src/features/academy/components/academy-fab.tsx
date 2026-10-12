import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Button, Icon, IconButton, Text } from '@/components';
import { useTheme } from '@/hooks';
import { t } from '@/i18n';

import { useActiveCourse } from '../hooks/use-active-course';
import { completedDays, nextDay } from '../rules';

const SIZE = 56;

/**
 * The Academy home. Typed routes list it as `/academy` or `/academy/index`
 * depending on the generator run; both reach `app/academy/index.tsx`.
 */
const ACADEMY_HOME = '/academy' as Href;

/**
 * The way into the Academy from the translator: a small round button at the
 * bottom right, and a card above it on the first tap.
 *
 * A card first rather than straight in, because a round icon on its own does
 * not say what it is. Once someone has started, the card says where they are
 * up to and goes straight back to it.
 */
export function AcademyFab() {
  const theme = useTheme();
  const router = useRouter();
  const { enrollment, progress } = useActiveCourse();
  const [open, setOpen] = useState(false);

  const day = enrollment ? nextDay(completedDays(progress), enrollment.startDay) : undefined;
  const go = () => {
    setOpen(false);
    router.push(ACADEMY_HOME);
  };

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        right: theme.layout.screenPadding,
        bottom: theme.spacing.base,
        alignItems: 'flex-end',
        gap: theme.spacing.sm,
      }}
    >
      {open ? (
        <View
          style={{
            width: 280,
            padding: theme.spacing.base,
            gap: theme.spacing.sm,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surface,
            borderWidth: theme.layout.borderWidth,
            borderColor: theme.colors.border,
            ...theme.shadows.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: theme.spacing.sm }}>
            <View style={{ flex: 1, gap: theme.spacing.xxs }}>
              <Text variant="rowTitle">{t('AI Academy')}</Text>
              <Text variant="bodySmall" color="textSecondary">
                {enrollment
                  ? day
                    ? t('Day {day} is waiting for you.', { day })
                    : t('Every day is done. Your final exam is ready.')
                  : t(
                      'Learn German, French or Spanish from English in 60 days, with an AI coach. Day 1 is free.',
                    )}
              </Text>
            </View>
            <IconButton
              name="close"
              accessibilityLabel={t('Close')}
              onPress={() => setOpen(false)}
            />
          </View>
          <Button
            label={enrollment ? t('Continue learning') : t('Start learning')}
            icon="arrow-forward"
            iconPosition="right"
            fullWidth
            onPress={go}
          />
        </View>
      ) : null}

      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={t('AI Academy')}
        accessibilityHint={t('Shows the language courses with an AI coach')}
        style={({ pressed }) => ({
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? theme.colors.primaryStrong : theme.colors.primary,
          ...theme.shadows.md,
        })}
      >
        <Icon name={open ? 'close' : 'school'} size={26} color="textOnPrimary" />
      </Pressable>
    </View>
  );
}
