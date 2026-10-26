// One pricing function for the website, checkout, manage booking and admin.
// Semantics match the prototype's AWStore.stayPrice: for each night, start from the
// base rate and add every active rule that hits that night. Rule deltas are computed
// on the base rate (they don't compound) and a night never goes below zero.
import { addDays, monthDay, weekday, type IsoDate } from '@/lib/dates';
import { percentOf, type Pesewas } from '@/lib/money';

export type VariantCode = 'STD' | 'EXE' | 'EXE_PLUS' | 'VIP' | 'DBL';

export type RateRule = {
  id: string;
  name: string;
  kind: 'range' | 'weekend' | 'longstay';
  /** "MM-DD" inclusive; a range may wrap the new year (12-20 → 01-02). */
  from?: string | null;
  to?: string | null;
  minNights?: number | null;
  /** 'all', or variant codes. 'EXE' also covers Executive Plus, as in the prototype. */
  appliesTo: 'all' | readonly VariantCode[];
  direction: 'up' | 'down';
  unit: 'pct' | 'ghs';
  /** Percent for 'pct', pesewas for 'ghs'. */
  amount: number;
  active: boolean;
};

export type PriceLine = { name: string; amount: Pesewas };
export type StayPrice = { base: Pesewas; total: Pesewas; lines: PriceLine[]; nightly: Pesewas[] };

export function ruleApplies(rule: RateRule, date: IsoDate, variant: VariantCode, nights: number): boolean {
  if (!rule.active) return false;
  if (rule.appliesTo !== 'all') {
    const covered = rule.appliesTo.includes(variant) || (variant === 'EXE_PLUS' && rule.appliesTo.includes('EXE'));
    if (!covered) return false;
  }
  switch (rule.kind) {
    case 'range': {
      if (!rule.from || !rule.to) return false;
      const md = monthDay(date);
      return rule.from <= rule.to ? md >= rule.from && md <= rule.to : md >= rule.from || md <= rule.to;
    }
    case 'weekend': {
      const dow = weekday(date);
      return dow === 5 || dow === 6; // Friday and Saturday nights
    }
    case 'longstay':
      return nights >= Math.max(1, rule.minNights ?? 1);
  }
}

export function stayPrice(
  variant: VariantCode,
  baseRate: Pesewas,
  checkIn: IsoDate,
  nights: number,
  rules: readonly RateRule[],
): StayPrice {
  if (!Number.isInteger(nights) || nights < 0) throw new RangeError('nights must be a whole number ≥ 0');
  const adjustments = new Map<string, number>();
  const nightly: Pesewas[] = [];
  for (let i = 0; i < nights; i++) {
    const date = addDays(checkIn, i);
    let price = baseRate;
    for (const rule of rules) {
      if (!ruleApplies(rule, date, variant, nights)) continue;
      const magnitude = rule.unit === 'pct' ? percentOf(baseRate, rule.amount) : rule.amount;
      const delta = rule.direction === 'down' ? -magnitude : magnitude;
      price += delta;
      adjustments.set(rule.name, (adjustments.get(rule.name) ?? 0) + delta);
    }
    nightly.push(Math.max(0, price));
  }
  return {
    base: baseRate * nights,
    total: nightly.reduce((a, b) => a + b, 0),
    lines: [...adjustments].map(([name, amount]) => ({ name, amount })),
    nightly,
  };
}

export type PromoCode = {
  code: string;
  type: 'pct' | 'ghs' | 'breakfast';
  /** Percent for 'pct', pesewas for 'ghs', unused for 'breakfast'. */
  value: number;
  endsOn?: IsoDate | null;
  appliesTo: 'all' | VariantCode;
  minNights?: number | null;
  active: boolean;
};

export type PromoResult =
  { ok: true; code: string; discount: Pesewas; freeBreakfast: boolean; label: string } | { ok: false; error: string };

/** Copy and rules from the prototype's AWStore.promoCheck. */
export function applyPromo(
  input: string,
  promos: readonly PromoCode[],
  ctx: { variant: VariantCode; nights: number; roomSubtotal: Pesewas; breakfastCost: Pesewas; today: IsoDate },
): PromoResult {
  const code = input.trim().toUpperCase();
  if (!code) return { ok: false, error: 'Enter a code.' };
  const promo = promos.find((p) => p.code.toUpperCase() === code);
  if (!promo) return { ok: false, error: "We don't recognise that code. Check the spelling." };
  if (!promo.active) return { ok: false, error: "That code isn't active right now." };
  if (promo.endsOn && promo.endsOn < ctx.today) return { ok: false, error: 'That code has expired.' };
  if (promo.appliesTo !== 'all' && promo.appliesTo !== ctx.variant && !(promo.appliesTo === 'EXE' && ctx.variant === 'EXE_PLUS')) {
    return { ok: false, error: "That code isn't valid for this room." };
  }
  if (promo.minNights && ctx.nights < promo.minNights) {
    return { ok: false, error: `That code needs a stay of ${promo.minNights} nights or more.` };
  }
  const discount =
    promo.type === 'pct'
      ? percentOf(ctx.roomSubtotal, promo.value)
      : promo.type === 'ghs'
        ? Math.min(ctx.roomSubtotal, promo.value)
        : ctx.breakfastCost;
  const label = promo.type === 'pct' ? `${promo.value}% off` : promo.type === 'ghs' ? `GHS ${promo.value / 100} off` : 'Free breakfast';
  return { ok: true, code, discount, freeBreakfast: promo.type === 'breakfast', label };
}
