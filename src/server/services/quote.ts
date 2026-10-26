// One stay quote for the booking page (live totals) and the server (which
// recomputes every figure and never trusts the browser's). Lines and rounding
// follow Checkout.dc.html: rate rules per night, breakfast per guest per night,
// a flat room-service fee, then the promo; the deposit rounds up to GHS 10.
import { nightsBetween, type IsoDate } from '@/lib/dates';
import { formatGhs, type Pesewas } from '@/lib/money';
import { applyPromo, stayPrice, type PromoCode, type PromoResult, type RateRule, type VariantCode } from './pricing';

export type QuoteInput = {
  variant: { code: VariantCode; name: string; price: Pesewas };
  checkIn: IsoDate;
  checkOut: IsoDate;
  guests: number;
  breakfast: boolean;
  roomService: boolean;
  rules: readonly RateRule[];
  fees: { breakfastPerGuestNight: Pesewas; roomService: Pesewas };
  depositPercent: number;
  /** The promo the guest applied (already looked up by code), if any. */
  promo?: PromoCode | null;
  today: IsoDate;
};

export type QuoteLine = { label: string; amount: Pesewas; kind: 'room' | 'rule' | 'breakfast' | 'room_service' | 'promo' };

export type Quote = {
  nights: number;
  roomBase: Pesewas;
  roomTotal: Pesewas;
  breakfast: Pesewas;
  roomService: Pesewas;
  discount: Pesewas;
  total: Pesewas;
  deposit: Pesewas;
  lines: QuoteLine[];
  promo: PromoResult | null;
};

/** The deposit rounds up to the next GHS 10, and never exceeds the total. */
export function depositFor(total: Pesewas, percent: number): Pesewas {
  if (total <= 0) return 0;
  return Math.min(total, Math.ceil((total * percent) / 100 / 1000) * 1000);
}

export function quoteStay(q: QuoteInput): Quote {
  const nights = Math.max(0, nightsBetween(q.checkIn, q.checkOut));
  const stay = stayPrice(q.variant.code, q.variant.price, q.checkIn, nights, q.rules);
  const breakfast = q.breakfast ? q.fees.breakfastPerGuestNight * q.guests * nights : 0;
  const roomService = q.roomService ? q.fees.roomService : 0;
  const lines: QuoteLine[] = [];
  if (nights) {
    lines.push({ label: `${q.variant.name.toUpperCase()} × ${nights}`, amount: stay.base, kind: 'room' });
    for (const l of stay.lines) lines.push({ label: l.name.toUpperCase(), amount: l.amount, kind: 'rule' });
  }
  if (breakfast) lines.push({ label: `BREAKFAST × ${q.guests} × ${nights}`, amount: breakfast, kind: 'breakfast' });
  if (roomService) lines.push({ label: 'ROOM SERVICE', amount: roomService, kind: 'room_service' });

  let promo: PromoResult | null = null;
  let discount = 0;
  if (q.promo && nights) {
    promo = applyPromo(q.promo.code, [q.promo], {
      variant: q.variant.code,
      nights,
      roomSubtotal: stay.total,
      breakfastCost: q.fees.breakfastPerGuestNight * q.guests * nights,
      today: q.today,
    });
    if (promo.ok) {
      // A free-breakfast code only saves money when breakfast is on the booking.
      discount = promo.freeBreakfast && !q.breakfast ? 0 : promo.discount;
      if (discount > 0) lines.push({ label: `PROMO ${promo.code}`, amount: -discount, kind: 'promo' });
    }
  }
  const total = Math.max(0, stay.total + breakfast + roomService - discount);
  return {
    nights,
    roomBase: stay.base,
    roomTotal: stay.total,
    breakfast,
    roomService,
    discount,
    total,
    deposit: depositFor(total, q.depositPercent),
    lines,
    promo,
  };
}

/** "GHS 400", or "− GHS 50" / "+ GHS 30" for adjustments, as the receipts print them. */
export function lineAmount(l: QuoteLine): string {
  if (l.kind === 'promo') return `− ${formatGhs(Math.abs(l.amount))}`;
  if (l.kind === 'rule') return `${l.amount < 0 ? '− ' : '+ '}${formatGhs(Math.abs(l.amount))}`;
  return formatGhs(l.amount);
}
