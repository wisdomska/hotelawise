// Rate limits for sign-in helpers, OTPs, forms and lookups. Upstash Redis when
// configured (shared across Worker isolates); otherwise an in-memory window per
// isolate, which still blunts bursts in development and until the keys exist.
import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env } from './env';

export type Rule = { limit: number; windowSeconds: number };

export const RULES = {
  newsletter: { limit: 5, windowSeconds: 600 },
  contact: { limit: 5, windowSeconds: 600 },
  enquiry: { limit: 5, windowSeconds: 600 },
  bookingLookup: { limit: 10, windowSeconds: 600 },
  guestOtp: { limit: 5, windowSeconds: 600 },
  hold: { limit: 20, windowSeconds: 600 },
} satisfies Record<string, Rule>;

const memory = new Map<string, { count: number; resetAt: number }>();
const limiters = new Map<string, Ratelimit>();

function upstash(name: string, rule: Rule): Ratelimit | null {
  const e = env();
  if (!e.UPSTASH_REDIS_REST_URL || !e.UPSTASH_REDIS_REST_TOKEN) return null;
  let l = limiters.get(name);
  if (!l) {
    l = new Ratelimit({
      redis: new Redis({ url: e.UPSTASH_REDIS_REST_URL, token: e.UPSTASH_REDIS_REST_TOKEN }),
      limiter: Ratelimit.slidingWindow(rule.limit, `${rule.windowSeconds} s`),
      prefix: `aw:${e.APP_ENV}:${name}`,
    });
    limiters.set(name, l);
  }
  return l;
}

/** Returns true when the call is allowed. */
export async function allow(name: keyof typeof RULES, key: string): Promise<boolean> {
  const rule = RULES[name];
  const l = upstash(name, rule);
  if (l) return (await l.limit(key)).success;
  const now = Date.now();
  const k = `${name}:${key}`;
  const entry = memory.get(k);
  if (!entry || entry.resetAt < now) {
    memory.set(k, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= rule.limit;
}
