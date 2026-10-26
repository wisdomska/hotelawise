// Public references (AW-7Q3K, AWR-…, EQ-…).
// A Postgres sequence gives a unique counter; a keyed Feistel permutation turns it
// into a scrambled number of the same width, so consecutive bookings don't get
// consecutive references and nobody can walk the sequence. The alphabet drops
// 0/O and 1/I so references read cleanly over the phone.
export const REF_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export const REF_KINDS = {
  booking: { prefix: 'AW', chars: 4 },
  rental: { prefix: 'AWR', chars: 4 },
  enquiry: { prefix: 'EQ', chars: 3 },
} as const;

export type RefKind = keyof typeof REF_KINDS;

function roundKeys(secret: string): number[] {
  // FNV-1a over the secret, then a xorshift stream: four 32-bit round keys.
  let h = 0x811c9dc5;
  for (let i = 0; i < secret.length; i++) {
    h ^= secret.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const keys: number[] = [];
  for (let i = 0; i < 4; i++) {
    h ^= h << 13;
    h >>>= 0;
    h ^= h >>> 17;
    h ^= h << 5;
    h >>>= 0;
    keys.push(h);
  }
  return keys;
}

function mix(x: number, k: number): number {
  let v = (x ^ k) >>> 0;
  v = Math.imul(v ^ (v >>> 16), 0x7feb352d) >>> 0;
  v = Math.imul(v ^ (v >>> 15), 0x846ca68b) >>> 0;
  return (v ^ (v >>> 16)) >>> 0;
}

/** Bijective permutation of [0, 2^bits) for even bits. */
export function permute(n: number, bits: number, secret: string): number {
  if (bits % 2 !== 0) throw new RangeError('bits must be even');
  const half = bits / 2;
  const mask = (1 << half) - 1;
  if (n < 0 || n >= 2 ** bits) throw new RangeError('n out of range');
  let l = (n >>> half) & mask;
  let r = n & mask;
  for (const k of roundKeys(secret)) {
    const next = l ^ (mix(r, k) & mask);
    l = r;
    r = next;
  }
  return ((l << half) | r) >>> 0;
}

function encode(n: number, chars: number): string {
  let out = '';
  for (let i = 0; i < chars; i++) {
    out = REF_ALPHABET[n % 32] + out;
    n = Math.floor(n / 32);
  }
  return out;
}

/**
 * Turns the nth value of a kind's sequence into its reference. When a kind
 * outgrows its width (e.g. 1,048,576 bookings), references gain a character.
 */
export function makeRef(kind: RefKind, sequenceValue: number, secret: string): string {
  const { prefix, chars: minChars } = REF_KINDS[kind];
  let chars: number = minChars;
  let offset = 0;
  // Keep 5 bits per character; width grows in whole characters with an even bit count.
  while (sequenceValue - offset >= 2 ** (bitsFor(chars))) {
    offset += 2 ** bitsFor(chars);
    chars += 1;
  }
  const bits = bitsFor(chars);
  const scrambled = permute(sequenceValue - offset, bits, `${secret}:${kind}:${chars}`);
  return `${prefix}-${encode(scrambled, chars)}`;
}

// 3 chars → 14 bits (fits 15), 4 → 20, 5 → 24, 6 → 30: the largest even number ≤ 5×chars.
function bitsFor(chars: number): number {
  const b = chars * 5;
  return b % 2 === 0 ? b : b - 1;
}

export function isRef(value: string, kind?: RefKind): boolean {
  const kinds = kind ? [REF_KINDS[kind]] : Object.values(REF_KINDS);
  return kinds.some(({ prefix }) => new RegExp(`^${prefix}-[${REF_ALPHABET}]{3,7}$`).test(value));
}

/** Accepts "aw 7q3k", "AW7Q3K" etc. from guests typing their reference. */
export function normaliseRef(input: string): string {
  const s = input.toUpperCase().replace(/[^A-Z0-9]/g, '');
  for (const { prefix } of Object.values(REF_KINDS).sort((a, b) => b.prefix.length - a.prefix.length)) {
    if (s.startsWith(prefix)) return `${prefix}-${s.slice(prefix.length)}`;
  }
  return s;
}
