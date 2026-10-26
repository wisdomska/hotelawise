// Test fixtures write straight to the e2e database (local, or the Neon `ci` branch).
import { sql } from 'drizzle-orm';
import { createNodeDb } from '../../../src/server/db/node';
import { createUser } from '../../../src/server/auth/users';
import type { Grant, Role } from '../../../src/server/auth/permissions';

export async function makeUser(input: { email: string; role: Role; password: string; grants?: Grant[] }) {
  const { db, close } = createNodeDb(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL!);
  try {
    return await createUser(db, {
      name: input.role === 'super_admin' ? 'Esi Asamoah' : 'Kojo Asante',
      email: input.email,
      role: input.role,
      temporaryPassword: input.password,
      grants: input.grants,
    });
  } finally {
    await close();
  }
}

/** Plants a known manage-booking code, as if the guest had received it by SMS. */
export async function plantGuestCode(ref: string, code: string) {
  const { createHash } = await import('node:crypto');
  const schema = await import('../../../src/server/db/schema');
  const { db, close } = createNodeDb(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL!);
  try {
    const secret = process.env.REF_SECRET!;
    await db.insert(schema.guestOtps).values({
      ref,
      channel: 'sms',
      codeHash: createHash('sha256').update(`${code}:${ref}:${secret}`).digest('hex'),
      expiresAt: new Date(Date.now() + 10 * 60_000),
    });
  } finally {
    await close();
  }
}

/** Writes one setting, as Settings in the admin would. */
export async function setSetting(key: string, value: unknown) {
  const schema = await import('../../../src/server/db/schema');
  const { db, close } = createNodeDb(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL!);
  try {
    await db
      .insert(schema.settings)
      .values({ key, value: value as never })
      .onConflictDoUpdate({ target: schema.settings.key, set: { value: value as never } });
  } finally {
    await close();
  }
}

/** Every test signs in from the same address; start each admin file with a clean sign-in budget. */
export async function clearSignInLimits() {
  const schema = await import('../../../src/server/db/schema');
  const { db, close } = createNodeDb(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL!);
  try {
    await db.delete(schema.rateLimits);
    await db.delete(schema.authRateLimit);
  } finally {
    await close();
  }
}

/** Frees rooms taken by earlier runs of the desk-booking test, so re-runs find a free room. */
export async function releaseTestStays(phoneE164: string) {
  const { db, close } = createNodeDb(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL!);
  try {
    await db.execute(sql`
      update room_allocations set active = false
       where booking_id in (select b.id from bookings b join customers c on c.id = b.customer_id
                             where c.phone_e164 = ${phoneE164} and b.source = 'walk_in')`);
    await db.execute(sql`
      update bookings set status = 'checked_out'
       where id in (select b.id from bookings b join customers c on c.id = b.customer_id
                     where c.phone_e164 = ${phoneE164} and b.source = 'walk_in' and b.status in ('confirmed','pending_payment','checked_in'))`);
  } finally {
    await close();
  }
}
