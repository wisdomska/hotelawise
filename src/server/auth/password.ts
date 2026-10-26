// Password hashing: scrypt (N=16384, r=16, p=1, 64-byte key) through node:crypto,
// which runs natively on Workers with nodejs_compat. Same parameters and
// "salt:key" format as Better Auth's default, plus a constant-time compare.
// Do not lower these parameters to fit a CPU budget (see docs/PLAN.md §1.1).
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 16384, r: 16, p: 1, keyLen: 64 } as const;

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      PARAMS.keyLen,
      { N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: 128 * PARAMS.N * PARAMS.r * 2 },
      (err, key) => (err ? reject(err) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${(await derive(password, salt)).toString('hex')}`;
}

export async function verifyPassword({ hash, password }: { hash: string; password: string }): Promise<boolean> {
  const [salt, key] = hash.split(':');
  if (!salt || !key) return false;
  const expected = Buffer.from(key, 'hex');
  const actual = await derive(password, salt);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Handoff rule: 8+ characters, with letters and a number. */
export function passwordProblem(password: string): string | null {
  if (password.length < 8) return 'Use at least 8 characters.';
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return 'Use letters and at least one number.';
  if (password.length > 128) return 'Use 128 characters or fewer.';
  return null;
}
