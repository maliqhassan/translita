import { msg, t } from '@/i18n';
import type { Reminder } from '@/services';

import { FABALITA } from './fabalita';

/** What Fabalita says, in turn, so the reminder never reads the same twice running. */
const DAILY = [
  msg('Day {day} is ready. Five minutes is all it takes!'),
  msg('A new conversation is waiting for you. Shall we?'),
  msg('A few minutes today keeps your words fresh.'),
];

/**
 * The week of reminders, in the app's language as it is now.
 *
 * The first one mentions the streak while there is one to keep; after two
 * quiet days, Fabalita says she misses you instead of repeating herself.
 */
export function buildReminders(
  times: readonly number[],
  facts: { day: number | undefined; streak: number },
): Reminder[] {
  return times.map((at, index) => {
    let body: string;
    if (index === 0 && facts.streak > 0) {
      body = t('Keep your {count}-day streak alive with Day {day}.', {
        count: facts.streak,
        day: facts.day ?? '',
      });
    } else if (index >= 2) {
      body = t('{name} misses you! Pick up where you left off.', { name: FABALITA.name });
    } else {
      body = t(DAILY[index % DAILY.length]!, { day: facts.day ?? '' });
    }
    return { at, title: t('Learn with {name}', { name: FABALITA.name }), body };
  });
}

/** The reminder's hour as the phone's clock shows it in the app's language: "7 PM", "19:00". */
export function reminderTimeLabel(hour: number, language: string): string {
  try {
    return new Intl.DateTimeFormat(language, { hour: 'numeric', minute: '2-digit' }).format(
      new Date(2026, 0, 1, hour),
    );
  } catch {
    return `${hour}:00`;
  }
}

/** The hours offered for the reminder, cycled through in Settings. */
export const REMINDER_HOURS = [8, 12, 18, 19, 20, 21] as const;
