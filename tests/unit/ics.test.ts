import { describe, expect, it } from 'vitest';
import { icsFile } from '@/lib/ics';

describe('calendar file', () => {
  it('writes an all-day stay with check-out as the exclusive end', () => {
    const f = icsFile({
      uid: 'AW-7Q3K@hotelawise.com',
      summary: 'Hotel A-Wise · VIP (AW-7Q3K)',
      location: 'No. 1 Wisepak Lane, New Asofan, Accra',
      start: '2027-03-01',
      end: '2027-03-03',
      stamp: new Date('2027-01-01T00:00:00Z'),
    });
    expect(f.split('\r\n')).toEqual(
      expect.arrayContaining([
        'DTSTART;VALUE=DATE:20270301',
        'DTEND;VALUE=DATE:20270303',
        'DTSTAMP:20270101T000000Z',
        'LOCATION:No. 1 Wisepak Lane\\, New Asofan\\, Accra',
      ]),
    );
    expect(f.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
  });

  it('writes timed events in UTC', () => {
    const f = icsFile({
      uid: 'x',
      summary: 'Collect rentals',
      location: 'Here',
      start: new Date('2027-03-01T07:00:00Z'),
      end: new Date('2027-03-01T08:00:00Z'),
    });
    expect(f).toContain('DTSTART:20270301T070000Z');
  });

  it('escapes the description when there is one', () => {
    const f = icsFile({
      uid: 'y',
      summary: 'Stay',
      location: 'Here',
      start: '2027-03-01',
      end: '2027-03-02',
      description: 'Ref AW-1; desk, 24h',
    });
    expect(f).toContain('DESCRIPTION:Ref AW-1\\; desk\\, 24h');
  });
});
