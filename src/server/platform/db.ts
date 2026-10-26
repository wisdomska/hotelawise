// Request-scoped database handles.
// - db(): reads and single statements over Neon's HTTP driver (no socket to manage).
// - withTransactionDb(fn): a WebSocket Pool for interactive transactions and row
//   locks (holds, orders, payments), opened for the call and closed after it.
// Local development can set DATABASE_DRIVER=pg to use any Postgres via node-postgres.
import 'server-only';
import { cache } from 'react';
import { neon } from '@neondatabase/serverless';
import { drizzle as drizzleHttp } from 'drizzle-orm/neon-http';
import * as schema from '@/server/db/schema';
import { createDb } from '@/server/db/client';
import type { AnyDb } from '@/server/services/holds';
import { env } from './env';

let nodeDb: AnyDb | undefined;

async function nodePostgres(): Promise<AnyDb> {
  if (!nodeDb) {
    const { createNodeDb } = await import('@/server/db/node');
    nodeDb = createNodeDb(env().DATABASE_URL).db as unknown as AnyDb;
  }
  return nodeDb;
}

export const db = cache(async (): Promise<AnyDb> => {
  if (env().DATABASE_DRIVER === 'pg') return nodePostgres();
  return drizzleHttp(neon(env().DATABASE_URL), { schema }) as unknown as AnyDb;
});

export async function withTransactionDb<T>(fn: (db: AnyDb) => Promise<T>): Promise<T> {
  if (env().DATABASE_DRIVER === 'pg') return fn(await nodePostgres());
  const { db: pooled, close } = createDb(env().DATABASE_URL);
  try {
    return await fn(pooled as unknown as AnyDb);
  } finally {
    await close();
  }
}
