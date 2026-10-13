import type { Unsubscribe } from '@/types';

import type { Service, ServiceResult } from '../types';

/**
 * Reminders on the phone, behind an interface: the only notifications the app
 * sends are the AI Academy's daily reminders, scheduled on the device. Nothing
 * is pushed from a server, and nothing is sent to anyone who has not said yes.
 */
export type ReminderPermission = 'granted' | 'denied' | 'undetermined';

export type Reminder = {
  /** When, as a time. */
  at: number;
  title: string;
  body: string;
};

export type NotificationService = Service & {
  /** What the phone currently allows, without asking. */
  permission(): Promise<ReminderPermission>;
  /** Asks, once the learner has said yes in the app. Resolves to whether it is allowed. */
  requestPermission(): Promise<boolean>;
  /** Replaces every scheduled reminder with these. */
  scheduleReminders(reminders: readonly Reminder[]): ServiceResult<void>;
  cancelReminders(): ServiceResult<void>;
  /** Called when a reminder is tapped. */
  onOpened(listener: () => void): Unsubscribe;
};
