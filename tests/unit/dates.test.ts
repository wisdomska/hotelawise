import { describe, expect, it } from 'vitest';
import {
  accraClock,
  accraHour,
  accraInstant,
  addDays,
  eachNight,
  formatDayMonth,
  formatShortDate,
  isIsoDate,
  isNightInAccra,
  monthDay,
  nightsBetween,
  rangesOverlap,
  todayInAccra,
  weekday,
} from '@/lib/dates';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isIsoDate('2026-10-26')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('26/10/2026')).toBe(false);
    expect(() => addDays('nope', 1)).toThrow(RangeError);
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });
  it('counts nights as [checkIn, checkOut)', () => {
    expect(nightsBetween('2026-10-26', '2026-10-28')).toBe(2);
    expect(eachNight('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01']);
    expect(eachNight('2026-10-30', '2026-10-30')).toEqual([]);
  });
  it('treats back-to-back stays as not overlapping', () => {
    expect(rangesOverlap('2026-10-26', '2026-10-28', '2026-10-28', '2026-10-30')).toBe(false);
    expect(rangesOverlap('2026-10-26', '2026-10-29', '2026-10-28', '2026-10-30')).toBe(true);
  });
  it('knows weekdays and month-days', () => {
    expect(weekday('2026-10-30')).toBe(5); // Friday
    expect(monthDay('2026-12-25')).toBe('12-25');
  });
  it('uses Accra time (UTC+0)', () => {
    const at = new Date('2026-10-26T23:30:00Z');
    expect(todayInAccra(at)).toBe('2026-10-26');
    expect(accraHour(at)).toBe(23);
    expect(accraClock(at)).toBe('23:30');
    expect(isNightInAccra(at)).toBe(true);
    expect(isNightInAccra(new Date('2026-10-26T12:00:00Z'))).toBe(false);
    expect(isNightInAccra(new Date('2026-10-26T05:59:00Z'))).toBe(true);
    expect(isNightInAccra(new Date('2026-10-26T18:00:00Z'))).toBe(true);
    expect(accraInstant('2026-10-27', 10).toISOString()).toBe('2026-10-27T10:00:00.000Z');
  });
  it('formats dates like the prototype', () => {
    expect(formatShortDate('2026-10-26')).toBe('Mon 26 Oct');
    expect(formatDayMonth('2026-09-27')).toBe('27 Sep');
  });
});
