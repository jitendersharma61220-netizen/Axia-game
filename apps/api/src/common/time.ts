import { config } from '../config';

/** YYYY-MM-DD in the platform time zone. */
export function dayKey(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: config.timeZone }).format(d);
}

/** ISO week key like 2026-W40 in the platform time zone. */
export function weekKey(d = new Date()): string {
  const [y, m, day] = dayKey(d).split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, day));
  const dow = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dow);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Start of the current day in the platform time zone, as a UTC Date. */
export function startOfDay(d = new Date()): Date {
  // Asia/Kolkata has a fixed +05:30 offset (no DST).
  return new Date(`${dayKey(d)}T00:00:00+05:30`);
}
