import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { appError, createLogger, err, ok } from '@/utils';

import type { NotificationService, ReminderPermission } from './notification-service';

const log = createLogger('notifications');

/** The Android channel the reminders arrive on, named in the phone's settings. */
const CHANNEL = 'academy-reminders';
/** Marks the reminders this app scheduled, so replacing them touches nothing else. */
const KIND = 'academy-reminder';

/*
 * A reminder is for when the app is closed. While it is open, the learner
 * needs no banner telling them to open it.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: false,
    shouldShowList: false,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: 'Daily learning reminders',
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

const toPermission = (status: string): ReminderPermission =>
  status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';

/** Local reminders through expo-notifications. The only file that imports it. */
export const expoNotificationService: NotificationService = {
  id: 'notifications',

  async isAvailable() {
    return true;
  },

  async permission() {
    try {
      return toPermission((await Notifications.getPermissionsAsync()).status);
    } catch {
      return 'undetermined';
    }
  },

  async requestPermission() {
    try {
      // On Android 13 and later the system asks only once a channel exists.
      await ensureChannel();
      const { status } = await Notifications.requestPermissionsAsync();
      return status === 'granted';
    } catch {
      log.warn('could not ask for notification permission');
      return false;
    }
  },

  async scheduleReminders(reminders) {
    try {
      await ensureChannel();
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const entry of scheduled) {
        if (entry.content.data?.kind === KIND) {
          await Notifications.cancelScheduledNotificationAsync(entry.identifier);
        }
      }
      for (const reminder of reminders) {
        if (reminder.at <= Date.now()) continue;
        await Notifications.scheduleNotificationAsync({
          content: { title: reminder.title, body: reminder.body, data: { kind: KIND } },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: reminder.at,
            channelId: CHANNEL,
          },
        });
      }
      return ok(undefined);
    } catch (cause) {
      log.warn('could not schedule reminders');
      return err(appError('unknown', 'Reminders could not be scheduled.', cause));
    }
  },

  async cancelReminders() {
    try {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      for (const entry of scheduled) {
        if (entry.content.data?.kind === KIND) {
          await Notifications.cancelScheduledNotificationAsync(entry.identifier);
        }
      }
      return ok(undefined);
    } catch (cause) {
      return err(appError('unknown', 'Reminders could not be cancelled.', cause));
    }
  },

  onOpened(listener) {
    const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.kind === KIND) listener();
    });
    return () => subscription.remove();
  },
};
