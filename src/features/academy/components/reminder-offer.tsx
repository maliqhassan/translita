import { useState } from 'react';
import { View } from 'react-native';
import Animated, { FadeInUp } from 'react-native-reanimated';

import { Button, Text } from '@/components';
import { useTheme } from '@/hooks';
import { currentAppLanguage, t } from '@/i18n';
import { services } from '@/services';
import { usePreferences } from '@/store';

import { FABALITA } from '../fabalita';
import { reminderTimeLabel } from '../reminders';

import { CoachAvatar } from './coach-avatar';

/**
 * Fabalita offers a daily reminder, once, after a finished lesson.
 *
 * Asked in the app first, and only on a yes does the phone ask for
 * permission: a system prompt at launch, before anyone knows what the
 * reminders are for, is the one most people refuse.
 */
export function ReminderOffer() {
  const theme = useTheme();
  const { preferences, update } = usePreferences();
  const [answer, setAnswer] = useState<'on' | 'blocked' | 'no'>();
  const time = reminderTimeLabel(preferences.reminderHour, currentAppLanguage());

  if (preferences.remindersAsked && !answer) return null;
  if (answer === 'no') return null;

  const yes = async () => {
    const granted = await services.notifications.requestPermission();
    await update({ reminders: granted, remindersAsked: true });
    setAnswer(granted ? 'on' : 'blocked');
  };

  return (
    <Animated.View
      entering={FadeInUp.delay(900).springify()}
      style={{
        alignSelf: 'stretch',
        gap: theme.spacing.md,
        padding: theme.spacing.base,
        borderRadius: theme.radius.xl,
        borderWidth: theme.layout.borderWidth,
        borderColor: theme.colors.aiBorder,
        backgroundColor: theme.colors.aiMuted,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.md }}>
        <CoachAvatar size={48} animated={false} />
        <View style={{ flex: 1, gap: theme.spacing.xxs }}>
          <Text variant="rowTitle">
            {answer === 'on'
              ? t('See you tomorrow at {time}!', { time })
              : answer === 'blocked'
                ? t('Reminders are off')
                : t('Want a daily nudge from {name}?', { name: FABALITA.name })}
          </Text>
          <Text variant="bodySmall" color="textSecondary">
            {answer === 'on'
              ? t('You can change the time in Settings.')
              : answer === 'blocked'
                ? t('Allow notifications for Translita in your phone settings to turn them on.')
                : t(
                    'One reminder at {time}, only on days you have not practised. Change it any time in Settings.',
                    { time },
                  )}
          </Text>
        </View>
      </View>
      {answer ? null : (
        <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Button
              label={t('Not now')}
              variant="ghost"
              fullWidth
              onPress={() => {
                void update({ remindersAsked: true });
                setAnswer('no');
              }}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Button
              label={t('Remind me')}
              icon="notifications"
              fullWidth
              onPress={() => void yes()}
            />
          </View>
        </View>
      )}
    </Animated.View>
  );
}
