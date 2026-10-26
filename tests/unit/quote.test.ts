import { describe, expect, it } from 'vitest';
import { depositFor, lineAmount, quoteStay, type QuoteInput } from '@/server/services/quote';

const base: QuoteInput = {
  variant: { code: 'VIP', name: 'VIP', price: 30000 },
  checkIn: '2027-03-01',
  checkOut: '2027-03-04',
  guests: 2,
  breakfast: false,
  roomService: false,
  rules: [],
  fees: { breakfastPerGuestNight: 5000, roomService: 2000 },
  depositPercent: 30,
  today: '2027-02-01',
};

describe('stay quote', () => {
  it('prices nights, breakfast and room service like the prototype receipt', () => {
    const q = quoteStay({ ...base, breakfast: true, roomService: true });
    expect(q.lines.map((l) => [l.label, lineAmount(l)])).toEqual([
      ['VIP × 3', 'GHS 900'],
      ['BREAKFAST × 2 × 3', 'GHS 300'],
      ['ROOM SERVICE', 'GHS 20'],
    ]);
    expect(q.total).toBe(122000);
    expect(q.deposit).toBe(37000); // 30% of 1,220 = 366, rounded up to 370
  });

  it('shows rate rules as their own lines', () => {
    const q = quoteStay({
      ...base,
      rules: [
        {
          id: 'r',
          name: 'Christmas',
          kind: 'range',
          from: '12-20',
          to: '01-02',
          appliesTo: 'all',
          direction: 'up',
          unit: 'pct',
          amount: 10,
          active: true,
        },
      ],
      checkIn: '2027-12-30',
      checkOut: '2028-01-01',
    });
    expect(q.lines.map((l) => [l.label, lineAmount(l)])).toEqual([
      ['VIP × 2', 'GHS 600'],
      ['CHRISTMAS', '+ GHS 60'],
    ]);
    expect(q.total).toBe(66000);
  });

  it('applies a free-breakfast code only once breakfast is ticked', () => {
    const promo = { code: 'AWISE3', type: 'breakfast' as const, value: 0, appliesTo: 'all' as const, minNights: 3, active: true };
    expect(quoteStay({ ...base, promo }).discount).toBe(0);
    const q = quoteStay({ ...base, promo, breakfast: true });
    expect(q.discount).toBe(30000);
    expect(q.total).toBe(90000);
    expect(lineAmount(q.lines.at(-1)!)).toBe('− GHS 300');
  });

  it('reports why a code does not apply', () => {
    const promo = { code: 'AWISE3', type: 'breakfast' as const, value: 0, appliesTo: 'all' as const, minNights: 5, active: true };
    expect(quoteStay({ ...base, promo }).promo).toEqual({ ok: false, error: 'That code needs a stay of 5 nights or more.' });
  });

  it('rounds deposits up to GHS 10 and never past the total', () => {
    expect(depositFor(45000, 30)).toBe(14000);
    expect(depositFor(500, 30)).toBe(500);
    expect(depositFor(0, 30)).toBe(0);
  });

  it('quotes nothing for an empty range', () => {
    const q = quoteStay({ ...base, checkOut: base.checkIn });
    expect([q.nights, q.total, q.lines.length]).toEqual([0, 0, 0]);
  });
});
