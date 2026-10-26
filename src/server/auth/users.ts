// Creating admin users outside Better Auth's (disabled) public sign-up: the first
// Super Admin script and the "Invite staff" action both use this.
import { randomUUID } from 'node:crypto';
import * as schema from '@/server/db/schema';
import type { AnyDb } from '@/server/services/holds';
import { hashPassword, passwordProblem } from './password';
import type { Grant, Role } from './permissions';

export type NewUser = {
  name: string;
  email: string;
  role: Role;
  temporaryPassword: string;
  grants?: Grant[];
};

export async function createUser(db: AnyDb, input: NewUser): Promise<string> {
  const problem = passwordProblem(input.temporaryPassword);
  if (problem) throw new RangeError(problem);
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new RangeError('Enter a valid email address.');
  const id = randomUUID();
  const hash = await hashPassword(input.temporaryPassword);
  await db.transaction(async (tx) => {
    await tx.insert(schema.user).values({ id, name: input.name.trim(), email, role: input.role, emailVerified: true, mustChangePassword: true });
    await tx.insert(schema.account).values({ id: randomUUID(), userId: id, accountId: id, providerId: 'credential', password: hash });
    if (input.grants?.length) {
      await tx.insert(schema.userPermissions).values(input.grants.map((key) => ({ userId: id, key })));
    }
  });
  return id;
}
