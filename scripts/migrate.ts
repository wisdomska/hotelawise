// Applies drizzle/ migrations. Run in CI before each deploy, never on page load.
//   DATABASE_URL_MIGRATE=postgres://… pnpm db:migrate
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createNodeDb } from '../src/server/db/node';

const url = process.env.DATABASE_URL_MIGRATE ?? process.env.DATABASE_URL;
if (!url) throw new Error('Set DATABASE_URL_MIGRATE');

const { db, close } = createNodeDb(url);
try {
  await migrate(db, { migrationsFolder: 'drizzle' });
  console.log('migrations applied');
} finally {
  await close();
}
