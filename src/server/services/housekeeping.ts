// Nightly tidy-up (02:00 Accra): spent sign-in and guest codes, finished
// rate-limit windows, expired sessions and old sign-in history. Nothing here
// touches bookings, orders, payments or the audit log.
import 'server-only';
import { lt, sql } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import type { AnyDb } from './holds';

/** How long sign-in history is kept (Users › Sign-in history shows the latest). */
export const LOGIN_HISTORY_DAYS = 180;

export type Swept = { codes: number; verifications: number; limits: number; authLimits: number; sessions: number; logins: number };

export async function housekeeping(db: AnyDb, now = new Date()): Promise<Swept> {
  const dayAgo = new Date(now.getTime() - 24 * 3600_000);
  const historyCutoff = new Date(now.getTime() - LOGIN_HISTORY_DAYS * 24 * 3600_000);
  const count = (rows: unknown[]) => rows.length;
  const [codes, verifications, limits, authLimits, sessions, logins] = await Promise.all([
    db.delete(s.guestOtps).where(lt(s.guestOtps.expiresAt, dayAgo)).returning({ id: s.guestOtps.id }).then(count),
    db.delete(s.verification).where(lt(s.verification.expiresAt, now)).returning({ id: s.verification.id }).then(count),
    db.delete(s.rateLimits).where(lt(s.rateLimits.resetAt, now)).returning({ k: s.rateLimits.key }).then(count),
    // Better Auth stores the window start in milliseconds; the longest window is 60 s.
    db
      .delete(s.authRateLimit)
      .where(sql`${s.authRateLimit.lastRequest} < ${dayAgo.getTime()}`)
      .returning({ id: s.authRateLimit.id })
      .then(count),
    db.delete(s.session).where(lt(s.session.expiresAt, now)).returning({ id: s.session.id }).then(count),
    db.delete(s.loginEvents).where(lt(s.loginEvents.at, historyCutoff)).returning({ id: s.loginEvents.id }).then(count),
  ]);
  return { codes, verifications, limits, authLimits, sessions, logins };
}
