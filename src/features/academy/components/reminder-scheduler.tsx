import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { services } from '@/services';
import { usePreferences } from '@/store';

import { useActiveCourse } from '../hooks/use-active-course';
import { buildReminders } from '../reminders';
import { completedDays, nextDay, reminderTimes, streak, todayProgress } from '../rules';

const ACADEMY_HOME = '/academy' as Href;

/**
 * Keeps the week of reminders up to date. Renders nothing.
 *
 * Planned again whenever it could change: the app coming to the front, a
 * lesson finished, the reminder switched or moved. Off, or with no course
 * started, there are none — and a tap on one opens the Academy.
 */
export function ReminderScheduler(): null {
  const router = useRouter();
  const { preferences } = usePreferences();
  const { enrollment, progress } = useActiveCourse();
  const [foreground, setForeground] = useState(0);
  const { reminders, reminderHour } = preferences;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setForeground((count) => count + 1);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => services.notifications.onOpened(() => router.push(ACADEMY_HOME)), [router]);

  useEffect(() => {
    if (!reminders || !enrollment) {
      void services.notifications.cancelReminders();
      return;
    }
    const now = Date.now();
    const completions = progress.map((entry) => entry.completedAt);
    const doneToday = todayProgress(completions, undefined, now) >= 1;
    const plan = buildReminders(reminderTimes(now, reminderHour, doneToday), {
      day: nextDay(completedDays(progress), enrollment.startDay),
      streak: streak(completions, now),
    });
    void services.notifications.scheduleReminders(plan);
  }, [reminders, reminderHour, enrollment, progress, foreground]);

  return null;
}
