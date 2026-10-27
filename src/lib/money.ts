// Money is always an integer number of pesewas (1 GHS = 100 pesewas). Never floats.
export type Pesewas = number & { readonly __brand?: 'pesewas' };

export const PESEWAS_PER_CEDI = 100;

export function assertPesewas(value: number): asserts value is Pesewas {
  if (!Number.isSafeInteger(value)) throw new RangeError(`Not a whole number of pesewas: ${value}`);
}

export function cedis(amount: number): Pesewas {
  const p = Math.round(amount * PESEWAS_PER_CEDI);
  assertPesewas(p);
  return p;
}

/** Percentage of an amount, rounded half-up to the nearest pesewa. */
export function percentOf(amount: Pesewas, percent: number): Pesewas {
  if (!Number.isFinite(percent)) throw new RangeError('percent must be finite');
  return Math.round((amount * percent) / 100);
}

export function sum(values: readonly Pesewas[]): Pesewas {
  return values.reduce<number>((a, b) => a + b, 0);
}

/**
 * "GHS 1,250" or "GHS 1,250.50". The prototype shows whole cedis without
 * decimals; pesewas appear only when present.
 */
export function formatGhs(amount: Pesewas, opts: { prefix?: boolean } = {}): string {
  assertPesewas(amount);
  const negative = amount < 0;
  const abs = Math.abs(amount);
  const whole = Math.floor(abs / PESEWAS_PER_CEDI);
  const frac = abs % PESEWAS_PER_CEDI;
  const body = whole.toLocaleString('en-GB') + (frac ? '.' + String(frac).padStart(2, '0') : '');
  const signed = (negative ? '−' : '') + body;
  return opts.prefix === false ? signed : `GHS ${signed}`;
}

/** Splits a total into deposit and balance for a deposit percentage. */
export function depositSplit(total: Pesewas, depositPercent: number): { deposit: Pesewas; balance: Pesewas } {
  const deposit = percentOf(total, depositPercent);
  return { deposit, balance: total - deposit };
}
