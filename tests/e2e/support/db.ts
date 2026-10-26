// Test fixtures write straight to the e2e database (local, or the Neon `ci` branch).
import { createNodeDb } from '../../../src/server/db/node';
import { createUser } from '../../../src/server/auth/users';
import type { Grant, Role } from '../../../src/server/auth/permissions';

export async function makeUser(input: { email: string; role: Role; password: string; grants?: Grant[] }) {
  const { db, close } = createNodeDb(process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL!);
  try {
    return await createUser(db, { name: input.role === 'super_admin' ? 'Esi Asamoah' : 'Kojo Asante', email: input.email, role: input.role, temporaryPassword: input.password, grants: input.grants });
  } finally {
    await close();
  }
}
