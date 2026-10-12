import { View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';

import { Icon, Text } from '@/components';
import { useTheme } from '@/hooks';
import { currentAppLanguage, t } from '@/i18n';

import type { WeekDay } from '../rules';

import { PulseHalo } from './motion';

const DOT = 34;

/** A day's initial in the app's language, or its date where the phone cannot name it. */
function weekday(date: number): string {
  try {
    return new Intl.DateTimeFormat(currentAppLanguage(), { weekday: 'narrow' }).format(date);
  } catch {
    return String(new Date(date).getDate());
  }
}

/**
 * The last seven days, ending today: a flame on each day a lesson was
 * finished, and today waiting with a pulse until it has one.
 */
export function WeekStrip({ days }: { days: readonly WeekDay[] }) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      {days.map((day, index) => {
        const waiting = day.today && !day.done;
        return (
          <Animated.View
            key={day.date}
            entering={ZoomIn.delay(index * theme.motion.stagger).springify()}
            accessible
            accessibilityLabel={
              day.done
                ? t('{day}: lesson done', { day: weekday(day.date) })
                : t('{day}: no lesson', { day: weekday(day.date) })
            }
            style={{ alignItems: 'center', gap: theme.spacing.xs }}
          >
            <Text variant="caption" color={day.today ? 'aiStrong' : 'textSecondary'}>
              {weekday(day.date)}
            </Text>
            <PulseHalo size={DOT} color={theme.colors.aiGlow} active={waiting}>
              <View
                style={{
                  width: DOT,
                  height: DOT,
                  borderRadius: DOT / 2,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: day.today ? 2 : theme.layout.borderWidth,
                  borderColor: day.done
                    ? theme.colors.flame
                    : day.today
                      ? theme.colors.aiFrom
                      : theme.colors.border,
                  backgroundColor: day.done ? theme.colors.flame : theme.colors.surface,
                }}
              >
                {day.done ? (
                  <Icon name="flame" size={18} color="textOnPrimary" />
                ) : day.today ? (
                  <Icon name="sparkles" size={14} color="aiStrong" />
                ) : null}
              </View>
            </PulseHalo>
          </Animated.View>
        );
      })}
    </View>
  );
}
