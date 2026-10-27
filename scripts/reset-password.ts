// Gives an admin user a new temporary password (they choose their own at the
// next sign-in). For the owner when nobody else can reset them.
//   DATABASE_URL=… RESET_EMAIL=… RESET_TEMP_PASSWORD=… pnpm exec tsx scripts/reset-password.ts
import { and, eq } from 'drizzle-orm';
import * as schema from '../src/server/db/schema';
import { createPasswordHasher, passwordProblem } from '../src/server/auth/password';
import { connect } from './connect';

const { DATABASE_URL, RESET_EMAIL, RESET_TEMP_PASSWORD } = process.env;
if (!DATABASE_URL || !RESET_EMAIL || !RESET_TEMP_PASSWORD) {
  console.error('Set DATABASE_URL, RESET_EMAIL and RESET_TEMP_PASSWORD.');
  process.exit(1);
}
const problem = passwordProblem(RESET_TEMP_PASSWORD);
if (problem) throw new RangeError(problem);

const { db, close } = connect(DATABASE_URL);
try {
  const [u] = await db.select().from(schema.user).where(eq(schema.user.email, RESET_EMAIL.trim().toLowerCase()));
  if (!u) throw new Error(`No user ${RESET_EMAIL}`);
  const hash = await createPasswordHasher(db).hash(RESET_TEMP_PASSWORD);
  await db.transaction(async (tx) => {
    await tx
      .update(schema.account)
      .set({ password: hash })
      .where(and(eq(schema.account.userId, u.id), eq(schema.account.providerId, 'credential')));
    await tx.update(schema.user).set({ mustChangePassword: true, banned: false }).where(eq(schema.user.id, u.id));
    await tx.delete(schema.session).where(eq(schema.session.userId, u.id));
  });
  console.log(`Temporary password set for ${u.email}; existing sessions signed out.`);
} finally {
  await close();
}
