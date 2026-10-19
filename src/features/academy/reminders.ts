import { msg, t } from '@/i18n';
import type { Reminder } from '@/services';

import { FABALITA } from './fabalita';

/** What Fabalita says, in turn, so the reminder never reads the same twice running. */
const DAILY = [
  msg('Hi! Your Day {day} lesson is ready. Shall we do it together? 🌱'),
  msg('I have a new conversation waiting for you. Just five minutes?'),
  msg('Let’s keep your new words fresh. I’m ready when you are!'),
];

/**
 * The week of reminders, in the app's language as it is now.
 *
 * Written as Fabalita talking, with her name as the sender. The first one
 * mentions the streak while there is one to keep; after two quiet days she
 * says she misses you instead of repeating herself.
 */
export function buildReminders(
  times: readonly number[],
  facts: { day: number | undefined; streak: number },
): Reminder[] {
  return times.map((at, index) => {
    let body: string;
    if (index === 0 && facts.streak > 0) {
      body = t('Don’t lose your {count}-day streak! Day {day} is ready for us. 🔥', {
        count: facts.streak,
        day: facts.day ?? '',
      });
    } else if (index >= 2) {
      body = t('I miss you! Let’s pick up where we left off. 💙');
    } else {
      body = t(DAILY[index % DAILY.length]!, { day: facts.day ?? '' });
    }
    return { at, title: FABALITA.name, body };
  });
}

/** Fabalita's two invitations, for someone who has not started a course. */
const INVITES = [
  msg('Hi, I’m Fabalita! 🌱 Want to learn a new language with me? Day 1 is free.'),
  msg('I can teach you German, French, Spanish and more in 10 minutes a day. Shall we start?'),
];

export function buildInvites(times: readonly number[]): Reminder[] {
  return times.slice(0, INVITES.length).map((at, index) => ({
    at,
    title: FABALITA.name,
    body: t(INVITES[index]!),
  }));
}

/** The invitations' times: the reminder hour, so many days after they were allowed. */
export function inviteTimes(from: number, hour: number, daysAfter: readonly number[]): number[] {
  const start = new Date(from);
  return daysAfter.map((days) =>
    new Date(start.getFullYear(), start.getMonth(), start.getDate() + days, hour).getTime(),
  );
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
