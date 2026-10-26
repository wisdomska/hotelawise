import { describe, expect, it } from 'vitest';
import { quoteRental, rentalReceipt } from '@/server/services/rental-quote';

const items = [
  { slug: 'canopy', name: 'Canopy', price: 25000, deposit: 10000 },
  { slug: 'foldchair', name: 'Foldable chair', price: 500, deposit: 200 },
  { slug: 'longtable', name: 'Long table', price: 4000, deposit: 2000 },
];
const wedding = { name: 'Wedding pack', pctOff: 10, items: { canopy: 4, foldchair: 100, longtable: 10 } };

describe('rental quote', () => {
  it('charges price × quantity × days with the start and end dates inclusive', () => {
    const q = quoteRental({ items, packs: [], cart: { canopy: 2 }, packsOn: [], from: '2027-06-05', to: '2027-06-06' });
    expect([q.days, q.subtotal, q.deposit, q.total]).toEqual([2, 100000, 20000, 120000]);
  });

  it('takes a pack’s percentage off the pack’s items while the cart still holds them', () => {
    const cart = { canopy: 4, foldchair: 100, longtable: 10 };
    const q = quoteRental({ items, packs: [wedding], cart, packsOn: ['Wedding pack'], from: '2027-06-05', to: '2027-06-05' });
    // pack price per day: 4×250 + 100×5 + 10×40 = 1,900; 10% = 190
    expect([q.subtotal, q.discount, q.packsApplied]).toEqual([190000, 19000, ['Wedding pack']]);
    expect(rentalReceipt(q).map((l) => [l.label, l.amount])).toEqual([
      ['CANOPY × 4', 'GHS 1,000'],
      ['FOLDABLE CHAIR × 100', 'GHS 500'],
      ['LONG TABLE × 10', 'GHS 400'],
      ['PACK DISCOUNT', '− GHS 190'],
      ['SECURITY DEPOSIT', 'GHS 800'],
    ]);
    const short = quoteRental({
      items,
      packs: [wedding],
      cart: { ...cart, canopy: 3 },
      packsOn: ['Wedding pack'],
      from: '2027-06-05',
      to: '2027-06-05',
    });
    expect(short.discount).toBe(0);
  });

  it('ignores packs that were never added', () => {
    const q = quoteRental({
      items,
      packs: [wedding],
      cart: { canopy: 4, foldchair: 100, longtable: 10 },
      packsOn: [],
      from: '2027-06-05',
      to: '2027-06-05',
    });
    expect(q.discount).toBe(0);
  });
});
