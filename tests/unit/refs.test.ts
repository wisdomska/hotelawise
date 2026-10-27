import { describe, expect, it } from 'vitest';
import { isRef, makeRef, normaliseRef, permute, REF_ALPHABET } from '@/lib/refs';

const SECRET = 'test-secret';

describe('references', () => {
  it('permutation is a bijection', () => {
    const seen = new Set<number>();
    for (let n = 0; n < 2 ** 14; n++) seen.add(permute(n, 14, SECRET));
    expect(seen.size).toBe(2 ** 14);
    expect(() => permute(0, 13, SECRET)).toThrow(RangeError);
    expect(() => permute(2 ** 14, 14, SECRET)).toThrow(RangeError);
  });
  it('gives unique, non-sequential booking refs', () => {
    const refs = Array.from({ length: 5000 }, (_, i) => makeRef('booking', i + 1, SECRET));
    expect(new Set(refs).size).toBe(5000);
    for (const r of refs) expect(isRef(r, 'booking')).toBe(true);
    expect(refs[0]).not.toBe(refs[1]);
    expect(refs[0]!.slice(0, -1)).not.toBe(refs[1]!.slice(0, -1));
  });
  it('never uses ambiguous characters', () => {
    expect(REF_ALPHABET).not.toMatch(/[01IO]/);
    expect(REF_ALPHABET).toHaveLength(32);
  });
  it('depends on the secret', () => {
    expect(makeRef('booking', 7, 'a')).not.toBe(makeRef('booking', 7, 'b'));
  });
  it('uses the right prefixes and widths, and grows when a width fills up', () => {
    expect(makeRef('rental', 1, SECRET)).toMatch(/^AWR-[A-Z2-9]{4}$/);
    expect(makeRef('enquiry', 1, SECRET)).toMatch(/^EQ-[A-Z2-9]{3}$/);
    expect(makeRef('enquiry', 2 ** 14 + 5, SECRET)).toMatch(/^EQ-[A-Z2-9]{4}$/);
  });
  it('normalises what guests type', () => {
    expect(normaliseRef('aw 7q3k')).toBe('AW-7Q3K');
    expect(normaliseRef('awr-2633')).toBe('AWR-2633');
    expect(normaliseRef('eq31k')).toBe('EQ-31K');
    expect(normaliseRef('zz')).toBe('ZZ');
    expect(isRef('AW-7Q3K')).toBe(true);
    expect(isRef('AW-0000')).toBe(false);
  });
});
