// Picks the driver for scripts: Neon's WebSocket driver for *.neon.tech (works
// where outbound Postgres port 5432 is blocked), node-postgres for anything else.
import { createDb } from '../src/server/db/client';
import { createNodeDb } from '../src/server/db/node';

export function isNeon(url: string) {
  try {
    return new URL(url).hostname.endsWith('.neon.tech');
  } catch {
    return false;
  }
}

export function connect(url: string) {
  if (isNeon(url)) {
    const { db, close } = createDb(url);
    return { db: db as unknown as ReturnType<typeof createNodeDb>['db'], close, neon: true as const };
  }
  const { db, close } = createNodeDb(url);
  return { db, close, neon: false as const };
}
