// Rate limits for sign-in helpers, OTPs, forms and lookups. Counters live in
// Postgres so every Worker isolate shares them (DECISIONS D-40); without a
// database (build, first local run) an in-memory window per isolate still
// blunts bursts. Old rows are cleared by the daily housekeeping job.
import 'server-only';
import { countCall } from '@/server/services/rate-limits';
import { db } from './db';
import { env } from './env';

export type Rule = { limit: number; windowSeconds: number };

export const RULES = {
  newsletter: { limit: 5, windowSeconds: 600 },
  contact: { limit: 5, windowSeconds: 600 },
  enquiry: { limit: 5, windowSeconds: 600 },
  bookingLookup: { limit: 10, windowSeconds: 600 },
  guestOtp: { limit: 5, windowSeconds: 600 },
  hold: { limit: 20, windowSeconds: 600 },
  availability: { limit: 60, windowSeconds: 600 },
  promo: { limit: 20, windowSeconds: 600 },
  payment: { limit: 30, windowSeconds: 600 },
  paymentStatus: { limit: 240, windowSeconds: 600 },
  manage: { limit: 40, windowSeconds: 600 },
  stepUp: { limit: 5, windowSeconds: 300 },
} satisfies Record<string, Rule>;

const memory = new Map<string, { count: number; resetAt: number }>();

function inMemory(k: string, rule: Rule): boolean {
  const now = Date.now();
  const entry = memory.get(k);
  if (!entry || entry.resetAt < now) {
    memory.set(k, { count: 1, resetAt: now + rule.windowSeconds * 1000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= rule.limit;
}

/** Returns true when the call is allowed. */
export async function allow(name: keyof typeof RULES, key: string): Promise<boolean> {
  const rule = RULES[name];
  const k = `${env().APP_ENV}:${name}:${key}`;
  if (!process.env.DATABASE_URL) return inMemory(k, rule);
  try {
    return (await countCall(await db(), k, rule.windowSeconds)) <= rule.limit;
  } catch (e) {
    // A database hiccup must not lock guests out; fall back to this isolate's window.
    console.warn('rate limit store unavailable:', e instanceof Error ? e.message : e);
    return inMemory(k, rule);
  }
}
