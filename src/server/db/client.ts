// Database access. Production and preview use Neon's serverless driver over
// WebSockets (Pool), which supports interactive transactions and row locks.
// Local development and tests can point DATABASE_URL at any Postgres; set
// DATABASE_DRIVER=pg to use node-postgres there.
import { Pool as NeonPool, neonConfig } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless';
import * as schema from './schema';

export type Db = ReturnType<typeof drizzleNeon<typeof schema>>;

/**
 * A request-scoped database. Workers can't share sockets between requests, so
 * each request creates its own pool and closes it when the response is done.
 */
export function createDb(url: string): { db: Db; close: () => Promise<void> } {
  if (typeof WebSocket === 'undefined') {
    throw new Error('createDb needs a WebSocket implementation (Workers runtime or Node 22+)');
  }
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new NeonPool({ connectionString: url });
  return { db: drizzleNeon(pool, { schema }), close: () => pool.end() };
}

export { schema };
