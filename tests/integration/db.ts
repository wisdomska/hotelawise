// Integration tests run against a real Postgres (local, or the Neon `ci` branch in CI).
// Each test file gets a fresh schema in its own database.
import pg from 'pg';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createNodeDb } from '@/server/db/node';

export const TEST_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres@localhost:5433/postgres';

export async function freshDb(name: string) {
  const admin = new pg.Client({ connectionString: TEST_URL });
  await admin.connect();
  const dbName = `t_${name}_${process.pid}`.toLowerCase().replace(/[^a-z0-9_]/g, '_');
  await admin.query(`drop database if exists ${dbName} with (force)`);
  await admin.query(`create database ${dbName}`);
  await admin.end();
  const url = new URL(TEST_URL);
  url.pathname = `/${dbName}`;
  const handle = createNodeDb(url.toString());
  await migrate(handle.db, { migrationsFolder: 'drizzle' });
  return {
    ...handle,
    async drop() {
      await handle.close();
      const a = new pg.Client({ connectionString: TEST_URL });
      await a.connect();
      await a.query(`drop database if exists ${dbName} with (force)`);
      await a.end();
    },
  };
}
