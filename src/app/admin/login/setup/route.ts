// First-login setup: replace the temporary password, then (Super Admins) enrol TOTP.
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';
import * as schema from '@/server/db/schema';
import { getAuth, currentActor } from '@/server/auth/session';
import { passwordProblem } from '@/server/auth/password';
import { db } from '@/server/platform/db';
import { audit } from '@/server/services/audit';

const body = z.object({ action: z.literal('change-password'), currentPassword: z.string().min(1), newPassword: z.string() });

export async function POST(request: Request) {
  const actor = await currentActor();
  if (!actor) return Response.json({ error: 'Sign in first.' }, { status: 401 });
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Fill in both passwords.' }, { status: 400 });
  const problem = passwordProblem(parsed.data.newPassword);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  if (parsed.data.newPassword === parsed.data.currentPassword) {
    return Response.json({ error: 'Pick a password different from the temporary one.' }, { status: 400 });
  }
  const auth = await getAuth();
  try {
    await auth.api.changePassword({
      headers: await headers(),
      body: { currentPassword: parsed.data.currentPassword, newPassword: parsed.data.newPassword, revokeOtherSessions: true },
    });
  } catch {
    return Response.json({ error: 'The temporary password is not right.' }, { status: 400 });
  }
  const database = await db();
  await database.update(schema.user).set({ mustChangePassword: false }).where(eq(schema.user.id, actor.id));
  await audit(database, { actor, action: 'Changed own password', entity: 'user', entityId: actor.id, target: actor.email });
  const next = actor.role === 'super_admin' && actor.twoFactorRequired && !actor.twoFactorEnabled ? 'enrol-2fa' : 'done';
  return Response.json({ next });
}
