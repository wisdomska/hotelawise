// Password hashing: bcrypt (cost 12) computed inside Postgres with pgcrypto.
// Why in the database: a strong hash costs ~100 ms of CPU, ten times the
// Workers Free per-request budget. Time a Worker spends waiting on the database
// doesn't count as CPU, so the hash keeps full strength and the Worker stays
// inside its limit (DECISIONS D-28). Never lower the cost to save time.
import { sql } from 'drizzle-orm';
import { rowsOf } from '@/server/db/rows';
import type { AnyDb } from '@/server/services/holds';

export const BCRYPT_COST = 12;
/** bcrypt only reads the first 72 bytes, so longer passwords are refused rather than silently cut. */
export const MAX_PASSWORD_BYTES = 72;

export type PasswordHasher = {
  hash: (password: string) => Promise<string>;
  verify: (data: { hash: string; password: string }) => Promise<boolean>;
};

const normalise = (password: string) => password.normalize('NFKC');

export function createPasswordHasher(db: AnyDb): PasswordHasher {
  return {
    async hash(password) {
      const res = await db.execute(sql`select crypt(${normalise(password)}, gen_salt('bf', ${sql.raw(String(BCRYPT_COST))})) as h`);
      return rowsOf<{ h: string }>(res)[0]!.h;
    },
    async verify({ hash, password }) {
      if (!/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(hash)) return false;
      const res = await db.execute(sql`select crypt(${normalise(password)}, ${hash}) = ${hash} as ok`);
      return rowsOf<{ ok: boolean }>(res)[0]!.ok === true;
    },
  };
}

/** Handoff rule: 8+ characters, with letters and a number. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use letters and at least one number.';
  if (new TextEncoder().encode(normalise(password)).length > MAX_PASSWORD_BYTES) return 'Use 72 characters or fewer.';
  return null;
}
