// node-postgres client for scripts, local development and integration tests.
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export function createNodeDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: 30 });
  // An idle client dropped by the server (restart, failover) must not crash the process.
  pool.on('error', (err) => console.warn('postgres idle client error:', err.message));
  return { db: drizzle(pool, { schema }), pool, close: () => pool.end() };
}

export type NodeDb = ReturnType<typeof createNodeDb>['db'];
