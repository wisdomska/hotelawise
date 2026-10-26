// Applies drizzle/ migrations. Run in CI before each deploy, never on page load.
//   DATABASE_URL_MIGRATE=postgres://… pnpm db:migrate
import { migrate as migrateNeon } from 'drizzle-orm/neon-serverless/migrator';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { connect } from './connect';

const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL_MIGRATE');

const c = connect(url);
try {
  if (c.neon) await migrateNeon(c.db as never, { migrationsFolder: 'drizzle' });
  else await migratePg(c.db, { migrationsFolder: 'drizzle' });
  console.log('migrations applied');
} finally {
  await c.close();
}
