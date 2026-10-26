// Creates the first Super Admin for an environment. There are no default or demo
// accounts anywhere (DECISIONS D-04). The new admin must change this temporary
// password and enrol TOTP on first sign-in.
//   SUPER_ADMIN_NAME="…" SUPER_ADMIN_EMAIL=… SUPER_ADMIN_TEMP_PASSWORD=… DATABASE_URL=… pnpm admin:create
import { createNodeDb } from '../src/server/db/node';
import { createUser } from '../src/server/auth/users';

const { DATABASE_URL, SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, SUPER_ADMIN_TEMP_PASSWORD } = process.env;
if (!DATABASE_URL || !SUPER_ADMIN_EMAIL || !SUPER_ADMIN_TEMP_PASSWORD) {
  console.error('Set DATABASE_URL, SUPER_ADMIN_EMAIL and SUPER_ADMIN_TEMP_PASSWORD (and optionally SUPER_ADMIN_NAME).');
  process.exit(1);
}

const { db, close } = createNodeDb(DATABASE_URL);
try {
  const id = await createUser(db, {
    name: SUPER_ADMIN_NAME ?? 'Super Admin',
    email: SUPER_ADMIN_EMAIL,
    role: 'super_admin',
    temporaryPassword: SUPER_ADMIN_TEMP_PASSWORD,
  });
  console.log(`Super Admin created (${SUPER_ADMIN_EMAIL}, id ${id}). Sign in at /admin/login to set a new password and enrol 2FA.`);
} finally {
  await close();
}
