// Turns a signed-in user into an Actor and enforces the account rules that sit
// on top of the permission matrix:
// - Super Admins must have TOTP enrolled before they can use anything else.
// - Anyone flagged mustChangePassword (first sign-in, admin reset) changes it first.
// - Money actions re-check the user's password (step-up).
import { and, eq } from 'drizzle-orm';
import * as schema from '@/server/db/schema';
import type { AnyDb } from '@/server/services/holds';
import { assertCan, ForbiddenError, type Actor, type Capability, type Grant } from './permissions';
import { createPasswordHasher } from './password';

export type ActorRecord = Actor & {
  name: string;
  email: string;
  jobTitle: string;
  twoFactorEnabled: boolean;
  mustChangePassword: boolean;
};

export type SetupStep = 'change-password' | 'enrol-2fa' | null;

export async function loadActor(db: AnyDb, userId: string): Promise<ActorRecord | null> {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.id, userId));
  if (!u) return null;
  const grants = await db
    .select({ key: schema.userPermissions.key })
    .from(schema.userPermissions)
    .where(and(eq(schema.userPermissions.userId, userId), eq(schema.userPermissions.enabled, true)));
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    jobTitle: u.jobTitle,
    role: u.role,
    grants: grants.map((g) => g.key as Grant),
    active: !u.banned,
    twoFactorEnabled: u.twoFactorEnabled,
    mustChangePassword: u.mustChangePassword,
  };
}

/** What the user must do before the admin opens up. */
export function pendingSetup(actor: ActorRecord): SetupStep {
  if (actor.mustChangePassword) return 'change-password';
  if (actor.role === 'super_admin' && !actor.twoFactorEnabled) return 'enrol-2fa';
  return null;
}

export class SetupRequiredError extends Error {
  readonly status = 403;
  constructor(readonly step: Exclude<SetupStep, null>) {
    super(`Account setup required: ${step}`);
    this.name = 'SetupRequiredError';
  }
}

/** The single server-side guard used by every admin action and query. */
export function authorize(actor: ActorRecord | null, capability: Capability): ActorRecord {
  if (!actor) throw new ForbiddenError(capability);
  const step = pendingSetup(actor);
  if (step) throw new SetupRequiredError(step);
  assertCan(actor, capability);
  return actor;
}

export class StepUpFailedError extends Error {
  readonly status = 401;
  constructor() {
    super('That password is not right.');
    this.name = 'StepUpFailedError';
  }
}

/** Every money action asks again for the signed-in user's password. */
export async function confirmPassword(db: AnyDb, userId: string, password: string): Promise<void> {
  const [acc] = await db
    .select({ hash: schema.account.password })
    .from(schema.account)
    .where(and(eq(schema.account.userId, userId), eq(schema.account.providerId, 'credential')));
  if (!acc?.hash || !(await createPasswordHasher(db).verify({ hash: acc.hash, password }))) throw new StepUpFailedError();
}
