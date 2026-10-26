import { describe, expect, it } from 'vitest';
import { cedis, depositSplit, formatGhs, percentOf, sum, assertPesewas } from '@/lib/money';

describe('money', () => {
  it('converts cedis to whole pesewas', () => {
    expect(cedis(150)).toBe(15000);
    expect(cedis(0.1 + 0.2)).toBe(30);
  });
  it('rejects fractional pesewas', () => {
    expect(() => assertPesewas(1.5)).toThrow(RangeError);
  });
  it('takes percentages, rounding to the nearest pesewa', () => {
    expect(percentOf(15000, 30)).toBe(4500);
    expect(percentOf(333, 10)).toBe(33);
    expect(() => percentOf(100, Number.NaN)).toThrow(RangeError);
  });
  it('sums', () => expect(sum([100, 250, 5])).toBe(355));
  it('formats like the prototype', () => {
    expect(formatGhs(125000)).toBe('GHS 1,250');
    expect(formatGhs(125050)).toBe('GHS 1,250.50');
    expect(formatGhs(-2000)).toBe('GHS −20');
    expect(formatGhs(30000, { prefix: false })).toBe('300');
  });
  it('splits a 30% deposit so deposit + balance = total', () => {
    const { deposit, balance } = depositSplit(45001, 30);
    expect(deposit).toBe(13500);
    expect(deposit + balance).toBe(45001);
  });
});
