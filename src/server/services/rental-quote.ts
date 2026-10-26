// Rental pricing for the catalogue (live) and the server (authoritative), as in
// Checkout.dc.html: price × qty × days, packs take their % off the pack's items
// when the cart holds at least the pack's quantities, plus a refundable deposit.
import { nightsBetween, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';

export type QuoteItem = { slug: string; name: string; price: number; deposit: number };
export type QuotePack = { name: string; pctOff: number; items: Record<string, number> };
export type RentalLine = { label: string; amount: string; color: string };

export type RentalQuote = {
  days: number;
  subtotal: number;
  discount: number;
  deposit: number;
  total: number;
  packsApplied: string[];
  lines: { slug: string; name: string; qty: number; amount: number }[];
};

export const rentalDaysBetween = (from: IsoDate, to: IsoDate) => Math.max(1, nightsBetween(from, to) + 1);

/** A pack counts when it was added and the cart still holds at least its quantities. */
export function packFits(pack: QuotePack, cart: Record<string, number>): boolean {
  return Object.entries(pack.items).every(([slug, q]) => (cart[slug] ?? 0) >= q);
}

export function quoteRental(input: {
  items: QuoteItem[];
  packs: QuotePack[];
  cart: Record<string, number>;
  packsOn: string[];
  from: IsoDate;
  to: IsoDate;
}): RentalQuote {
  const days = rentalDaysBetween(input.from, input.to);
  const lines = input.items
    .filter((it) => (input.cart[it.slug] ?? 0) > 0)
    .map((it) => {
      const qty = input.cart[it.slug]!;
      return { slug: it.slug, name: it.name, qty, amount: qty * it.price * days };
    });
  const subtotal = lines.reduce((s, l) => s + l.amount, 0);
  const deposit = input.items.reduce((s, it) => s + (input.cart[it.slug] ?? 0) * it.deposit, 0);
  const priceOf = (slug: string) => input.items.find((i) => i.slug === slug)?.price ?? 0;
  const packsApplied: string[] = [];
  let discount = 0;
  for (const pack of input.packs) {
    if (!input.packsOn.includes(pack.name) || !packFits(pack, input.cart)) continue;
    const full = Object.entries(pack.items).reduce((t, [slug, q]) => t + q * priceOf(slug), 0);
    discount += Math.round((full * days * pack.pctOff) / 100);
    packsApplied.push(pack.name);
  }
  discount = Math.min(discount, subtotal);
  return { days, subtotal, discount, deposit, total: subtotal - discount + deposit, packsApplied, lines };
}

/** Receipt lines as the prototype prints them. */
export function rentalReceipt(q: RentalQuote): RentalLine[] {
  return [
    ...q.lines.map((l) => ({ label: `${l.name.toUpperCase()} × ${l.qty}`, amount: formatGhs(l.amount), color: 'inherit' })),
    ...(q.discount ? [{ label: 'PACK DISCOUNT', amount: `− ${formatGhs(q.discount)}`, color: '#1F7A4D' }] : []),
    { label: 'SECURITY DEPOSIT', amount: formatGhs(q.deposit), color: 'rgba(0,0,58,0.6)' },
  ];
}
