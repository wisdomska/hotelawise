// The wrapper every admin server action goes through: permission check,
// password step-up for money, friendly errors, and a refresh of the admin.
import 'server-only';
import { revalidatePath, revalidateTag } from 'next/cache';
import { ZodError } from 'zod';
import { fail, type ActionResult } from '@/lib/admin/result';
import { confirmPassword, SetupRequiredError, StepUpFailedError } from '@/server/auth/actor';
import { ForbiddenError, type Capability } from '@/server/auth/permissions';
import { requirePermission } from '@/server/auth/session';
import { SITE_TAG } from '@/server/content/site-data';
import { db, withTransactionDb } from '@/server/platform/db';
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

type Opts = { password?: string; site?: boolean };

export async function act(
  capability: Capability,
  fn: (tx: AnyDb, who: Who) => Promise<ActionResult>,
  opts: Opts = {},
): Promise<ActionResult> {
  try {
    const actor = await requirePermission(capability);
    if (opts.password !== undefined) {
      if (!opts.password) return fail('Enter your password.', { pw: 'Enter your password.' });
      await confirmPassword(await db(), actor.id, opts.password);
    }
    const r = await withTransactionDb((tx) => fn(tx, { id: actor.id, name: actor.name }));
    if (r.ok) {
      revalidatePath('/admin', 'layout');
      if (opts.site) revalidateTag(SITE_TAG, 'max');
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
