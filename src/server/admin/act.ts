// The wrapper every admin server action goes through: permission check,
// password step-up for money, friendly errors, and a refresh of the admin.
import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { availabilityChanged } from '@/server/content/availability';
import { ZodError } from 'zod';
import { fail, type ActionResult } from '@/lib/admin/result';
import { confirmPassword, SetupRequiredError, StepUpFailedError } from '@/server/auth/actor';
import { ForbiddenError, type Capability } from '@/server/auth/permissions';
import { requirePermission } from '@/server/auth/session';
import { SITE_TAG } from '@/server/content/site-data';
import { db, withTransactionDb } from '@/server/platform/db';
import { allow } from '@/server/platform/rate-limit';
import type { AnyDb } from '@/server/services/holds';
import type { Who } from './bookings';

/** Errors whose message is written for staff and safe to show as-is. */
const FRIENDLY = new Set(['BookingStateError', 'RoomTakenError', 'RefundError', 'RangeError', 'NoRoomAvailableError', 'AdminError']);

export class AdminError extends Error {
  constructor(
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AdminError';
  }
}

/**
 * `password` turns on the step-up: the signed-in user's password is checked
 * before anything runs. The key's presence is what counts, so a request that
 * leaves the field out (or sends something that isn't a string) is refused,
 * never waved through.
 */
type Opts = { password?: unknown; site?: boolean };

export async function act(
  capability: Capability,
  fn: (tx: AnyDb, who: Who) => Promise<ActionResult>,
  opts: Opts = {},
): Promise<ActionResult> {
  try {
    const actor = await requirePermission(capability);
    if ('password' in opts) {
      if (typeof opts.password !== 'string' || !opts.password) return fail('Enter your password.', { pw: 'Enter your password.' });
      if (!(await allow('stepUp', actor.id)))
        return fail('Too many password attempts. Wait a few minutes and try again.', { pw: 'Too many attempts. Wait a few minutes.' });
      await confirmPassword(await db(), actor.id, opts.password);
    }
    const r = await withTransactionDb((tx) => fn(tx, { id: actor.id, name: actor.name }));
    if (r.ok) {
      revalidatePath('/admin', 'layout');
      // Expire, not "stale while revalidate": the next visitor gets the change, not the old page.
      if (opts.site) revalidateTag(SITE_TAG, { expire: 0 });
      availabilityChanged();
    }
    return r;
  } catch (e) {
    if (e instanceof StepUpFailedError) return fail('That password isn’t right.', { pw: 'That password isn’t right.' });
    if (e instanceof ForbiddenError) return fail('Your role can’t do that. Ask a Super Admin.');
    if (e instanceof SetupRequiredError) return fail('Finish setting up your account first.');
    if (e instanceof ZodError) return fail('Something on the form needs another look.');
    if (e instanceof AdminError) return fail(e.message, e.fields);
    if (e instanceof Error && FRIENDLY.has(e.name)) return fail(e.message);
    console.error('admin action failed', e);
    return fail('That didn’t work. Try again, or refresh the page.');
  }
}

/** Reads for drawers and modals: permission check, then the query on the HTTP driver. */
export async function read<T>(capability: Capability, fn: (d: AnyDb, who: Who & { isSuper: boolean }) => Promise<T>): Promise<T | null> {
  try {
    const actor = await requirePermission(capability);
    return await fn(await db(), { id: actor.id, name: actor.name, isSuper: actor.role === 'super_admin' });
  } catch (e) {
    if (e instanceof ForbiddenError || e instanceof SetupRequiredError) return null;
    throw e;
  }
}
