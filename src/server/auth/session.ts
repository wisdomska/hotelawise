// Request helpers for admin pages and actions.
import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import { forbidden, redirect } from 'next/navigation';
import { db } from '@/server/platform/db';
import { env } from '@/server/platform/env';
import * as schema from '@/server/db/schema';
import { createAuth } from './auth';
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

/** The signed-in admin user, or null. Cached for the request. */
export const currentActor = cache(async (): Promise<ActorRecord | null> => {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
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
