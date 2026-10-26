// iCalendar files for "Add to calendar" (bookings and rental pickups).
const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export type IcsEvent = {
  uid: string;
  summary: string;
  description?: string;
  location: string;
  /** All-day events take dates (YYYY-MM-DD, end exclusive); timed events take instants. */
  start: string | Date;
  end: string | Date;
  stamp?: Date;
};

const utc = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');

export function icsFile(e: IcsEvent): string {
  const when = (k: 'DTSTART' | 'DTEND', v: string | Date) =>
    typeof v === 'string' ? `${k};VALUE=DATE:${v.replace(/-/g, '')}` : `${k}:${utc(v)}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Hotel A-Wise//Bookings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${e.uid}`,
    `DTSTAMP:${utc(e.stamp ?? new Date())}`,
    when('DTSTART', e.start),
    when('DTEND', e.end),
    `SUMMARY:${esc(e.summary)}`,
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    `LOCATION:${esc(e.location)}`,
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
