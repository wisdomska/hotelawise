// node-postgres client for scripts, local development and integration tests.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export function createNodeDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 30 });
  return { db: drizzle(pool, { schema }), pool, close: () => pool.end() };
}

export type NodeDb = ReturnType<typeof createNodeDb>['db'];
