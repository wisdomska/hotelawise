import { describe, expect, it } from 'vitest';
import { applyPromo, ruleApplies, stayPrice, type PromoCode, type RateRule } from '@/server/services/pricing';

// The prototype's seed rules (store.js), in pesewas.
const rules: RateRule[] = [
  {
    id: 'r1',
    name: 'Christmas & New Year',
    kind: 'range',
    from: '12-20',
    to: '01-02',
    appliesTo: 'all',
    direction: 'up',
    unit: 'pct',
    amount: 15,
    active: true,
  },
  { id: 'r2', name: 'Weekend nights', kind: 'weekend', appliesTo: ['DBL'], direction: 'up', unit: 'ghs', amount: 3000, active: true },
  {
    id: 'r3',
    name: 'Long stay',
    kind: 'longstay',
    minNights: 7,
    appliesTo: 'all',
    direction: 'down',
    unit: 'pct',
    amount: 10,
    active: true,
  },
  {
    id: 'r4',
    name: 'Independence Day',
    kind: 'range',
    from: '03-06',
    to: '03-06',
    appliesTo: 'all',
    direction: 'up',
    unit: 'pct',
    amount: 10,
    active: false,
  },
];

describe('stayPrice', () => {
  it('charges the base rate on an ordinary weekday stay', () => {
    const p = stayPrice('STD', 15000, '2026-10-26', 2, rules); // Mon, Tue
    expect(p).toMatchObject({ base: 30000, total: 30000, lines: [] });
  });
  it('adds GHS 30 on Friday and Saturday nights for the Double only', () => {
    const dbl = stayPrice('DBL', 40000, '2026-10-29', 3, rules); // Thu, Fri, Sat
    expect(dbl.nightly).toEqual([40000, 43000, 43000]);
    expect(dbl.lines).toEqual([{ name: 'Weekend nights', amount: 6000 }]);
    expect(stayPrice('VIP', 30000, '2026-10-30', 1, rules).total).toBe(30000);
  });
  it('applies seasonal ranges that wrap the new year', () => {
    const p = stayPrice('STD', 15000, '2026-12-31', 3, rules); // 31 Dec, 1 Jan, 2 Jan
    expect(p.nightly).toEqual([17250, 17250, 17250]);
    expect(stayPrice('STD', 15000, '2027-01-03', 1, rules).total).toBe(15000);
  });
  it('gives long stays 10% off every night, computed on base (no compounding)', () => {
    const p = stayPrice('DBL', 40000, '2026-12-19', 7, rules);
    // 19 Dec Sat: +3000 −4000; 20 Dec Sun: +6000 −4000; 21–24 Mon–Thu: +6000 −4000; 25 Fri: +6000 +3000 −4000
    expect(p.nightly).toEqual([39000, 42000, 42000, 42000, 42000, 42000, 45000]);
  });
  it('ignores paused rules and handles a 30-night stay', () => {
    expect(stayPrice('STD', 15000, '2027-03-06', 1, rules).total).toBe(15000);
    const month = stayPrice('STD', 15000, '2027-02-01', 30, rules);
    expect(month.total).toBe(30 * 13500);
  });
  it('never prices a night below zero and rejects bad night counts', () => {
    const big: RateRule = {
      id: 'x',
      name: 'Huge',
      kind: 'longstay',
      minNights: 1,
      appliesTo: 'all',
      direction: 'down',
      unit: 'ghs',
      amount: 99999,
      active: true,
    };
    expect(stayPrice('STD', 15000, '2026-10-26', 1, [big]).total).toBe(0);
    expect(() => stayPrice('STD', 15000, '2026-10-26', -1, rules)).toThrow(RangeError);
    expect(() => stayPrice('STD', 15000, '2026-10-26', 1.5, rules)).toThrow(RangeError);
    expect(stayPrice('STD', 15000, '2026-10-26', 0, rules).total).toBe(0);
  });
  it('lets an EXE rule cover Executive Plus, but not the reverse', () => {
    const exe: RateRule = { ...rules[1]!, kind: 'longstay', minNights: 1, appliesTo: ['EXE'] };
    const plus: RateRule = { ...exe, appliesTo: ['EXE_PLUS'] };
    expect(ruleApplies(exe, '2026-10-26', 'EXE_PLUS', 1)).toBe(true);
    expect(ruleApplies(plus, '2026-10-26', 'EXE', 1)).toBe(false);
    expect(ruleApplies({ ...rules[0]!, from: null }, '2026-12-25', 'STD', 1)).toBe(false);
  });
});

describe('applyPromo', () => {
  const promos: PromoCode[] = [
    { code: 'AWISE3', type: 'breakfast', value: 0, endsOn: '2026-11-30', appliesTo: 'all', minNights: 3, active: true },
    { code: 'NIGHTOWL', type: 'ghs', value: 2000, endsOn: '2026-12-31', appliesTo: 'all', active: true },
    { code: 'EASTER25', type: 'pct', value: 10, endsOn: '2026-04-30', appliesTo: 'all', active: true },
    { code: 'EXEONLY', type: 'pct', value: 10, appliesTo: 'EXE', active: true },
    { code: 'PAUSED', type: 'pct', value: 10, appliesTo: 'all', active: false },
  ];
  const ctx = { variant: 'STD' as const, nights: 3, roomSubtotal: 45000, breakfastCost: 30000, today: '2026-10-26' };

  it('uses the prototype copy for every failure', () => {
    expect(applyPromo('  ', promos, ctx)).toEqual({ ok: false, error: 'Enter a code.' });
    expect(applyPromo('NOPE', promos, ctx)).toMatchObject({ ok: false, error: expect.stringContaining('recognise') });
    expect(applyPromo('paused', promos, ctx)).toMatchObject({ ok: false, error: expect.stringContaining('active') });
    expect(applyPromo('EASTER25', promos, ctx)).toMatchObject({ ok: false, error: 'That code has expired.' });
    expect(applyPromo('EXEONLY', promos, ctx)).toMatchObject({ ok: false, error: expect.stringContaining('this room') });
    expect(applyPromo('AWISE3', promos, { ...ctx, nights: 2 })).toMatchObject({ ok: false, error: expect.stringContaining('3 nights') });
  });
  it('computes discounts', () => {
    expect(applyPromo('awise3', promos, ctx)).toMatchObject({ ok: true, discount: 30000, freeBreakfast: true, label: 'Free breakfast' });
    expect(applyPromo('NIGHTOWL', promos, ctx)).toMatchObject({ ok: true, discount: 2000, label: 'GHS 20 off' });
    expect(applyPromo('NIGHTOWL', promos, { ...ctx, roomSubtotal: 1000 })).toMatchObject({ discount: 1000 });
    expect(applyPromo('EXEONLY', promos, { ...ctx, variant: 'EXE_PLUS' })).toMatchObject({ ok: true, discount: 4500, label: '10% off' });
  });
});
