// Request helpers for admin pages and actions.
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { db } from '@/server/platform/db';
import { env } from '@/server/platform/env';
import * as schema from '@/server/db/schema';
import { eq } from 'drizzle-orm';
import { SEED_SETTINGS } from '@/server/content/defaults';
import { createAuth, IDLE_TIMEOUT_SECONDS } from './auth';
import { authorize, loadActor, pendingSetup, type ActorRecord } from './actor';
import { can, type Capability } from './permissions';

export const getAuth = cache(async () => {
  const database = await db();
  const e = env();
  return createAuth({
    db: database,
    secret: e.BETTER_AUTH_SECRET,
    baseURL: e.APP_URL,
    async sendResetCode(email, code) {
      const { sendPasswordResetCode } = await import('@/server/integrations/email');
      await sendPasswordResetCode(email, code);
    },
    async onSignInAttempt(a) {
      await database.insert(schema.loginEvents).values({ email: a.email, success: a.success, ip: a.ip, userAgent: a.userAgent });
    },
  });
});

/** Settings › Security › "Sign out after", capped at the session's own 30-minute life. */
async function idleLimitMs(): Promise<number> {
  const [row] = await (
    await db()
  )
    .select({ value: schema.settings.value })
    .from(schema.settings)
    .where(eq(schema.settings.key, 'admin.sessionTimeoutMinutes'));
  const minutes = Number(row?.value ?? SEED_SETTINGS['admin.sessionTimeoutMinutes']) || 30;
  return Math.min(minutes * 60, IDLE_TIMEOUT_SECONDS) * 1000;
}

/**
 * The signed-in admin user, or null. Cached for the request.
 * The idle sign-out is enforced here, not only in the browser: the session's
 * last activity is read before Better Auth refreshes it, and a session idle
 * for longer than the setting is ended.
 */
export const currentActor = cache(async (): Promise<ActorRecord | null> => {
  const auth = await getAuth();
  const h = await headers();
  const peek = await auth.api.getSession({ headers: h, query: { disableRefresh: true } });
  if (!peek) return null;
  const lastSeen = peek.session.expiresAt.getTime() - IDLE_TIMEOUT_SECONDS * 1000;
  // Better Auth only records activity once a minute (updateAge), so allow that much.
  if (Date.now() - lastSeen > (await idleLimitMs()) + 60_000) {
    await (await db()).delete(schema.session).where(eq(schema.session.id, peek.session.id));
    return null;
  }
  const session = await auth.api.getSession({ headers: h });
  if (!session) return null;
  return loadActor(await db(), session.user.id);
});

/** The one guard every admin action and query calls first. */
export async function requirePermission(capability: Capability): Promise<ActorRecord> {
  return authorize(await currentActor(), capability);
}

/** For admin pages: sends people to sign-in or setup, and answers 403 when the role can't use the screen. */
export async function requirePage(capability: Capability): Promise<ActorRecord> {
  const actor = await currentActor();
  if (!actor || !actor.active) redirect('/admin/login');
  const step = pendingSetup(actor);
  if (step) redirect(`/admin/login?setup=${step}`);
  if (!can(actor, capability)) forbidden();
  return actor;
}
