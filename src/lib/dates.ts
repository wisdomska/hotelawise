// Stay dates are plain ISO dates ("2026-10-26") and night ranges are [checkIn, checkOut).
// Timestamps are stored in UTC and shown in Africa/Accra (UTC+0, no DST).
export const HOTEL_TZ = 'Africa/Accra';

export type IsoDate = string;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): value is IsoDate {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUtc(date: IsoDate): Date {
  if (!isIsoDate(date)) throw new RangeError(`Invalid ISO date: ${date}`);
  return new Date(date + 'T00:00:00Z');
}

export function addDays(date: IsoDate, days: number): IsoDate {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function nightsBetween(checkIn: IsoDate, checkOut: IsoDate): number {
  return Math.round((toUtc(checkOut).getTime() - toUtc(checkIn).getTime()) / 86_400_000);
}

/** Each night of a stay: [checkIn, checkOut). */
export function eachNight(checkIn: IsoDate, checkOut: IsoDate): IsoDate[] {
  const n = nightsBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

/** Half-open ranges overlap when a.start < b.end and b.start < a.end. */
export function rangesOverlap(aStart: IsoDate, aEnd: IsoDate, bStart: IsoDate, bEnd: IsoDate): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: IsoDate): number {
  return toUtc(date).getUTCDay();
}

/** "MM-DD" for rules that repeat every year. */
export function monthDay(date: IsoDate): string {
  return date.slice(5);
}

/** Today's date at the hotel. */
export function todayInAccra(now: Date = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: HOTEL_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function accraHour(now: Date = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-GB', { timeZone: HOTEL_TZ, hour: '2-digit', hourCycle: 'h23' }).format(now));
}

/** Prototype night(): 18:00–05:59 Accra time. */
export function isNightInAccra(now: Date = new Date()): boolean {
  const h = accraHour(now);
  return h < 6 || h >= 18;
}

/** "HH:mm" in Accra, for the live clock. */
export function accraClock(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: HOTEL_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
}

/** "Mon 26 Oct", as used across the prototype. */
export function formatShortDate(date: IsoDate): string {
  const d = toUtc(date);
  const wd = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' }).format(d);
  const day = d.getUTCDate();
  const mon = MONTHS[d.getUTCMonth()];
  return `${wd} ${day} ${mon}`;
}

/** "26 Oct" — month names are fixed three-letter forms ("Sep", never "Sept"). */
export function formatDayMonth(date: IsoDate): string {
  const d = toUtc(date);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The instant a given Accra wall-clock time occurs (Accra is UTC+0 year-round). */
export function accraInstant(date: IsoDate, hour: number, minute = 0): Date {
  const d = toUtc(date);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
}
