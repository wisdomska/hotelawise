// Draws the next public reference from its Postgres sequence (see lib/refs).
import { sql } from 'drizzle-orm';
import { makeRef, type RefKind } from '@/lib/refs';
import type { AnyDb } from './holds';

const SEQUENCE: Record<RefKind, string> = {
  booking: 'booking_ref_seq',
  rental: 'rental_ref_seq',
  enquiry: 'enquiry_ref_seq',
};

export async function nextRef(db: AnyDb, kind: RefKind, secret: string): Promise<string> {
  const res = await db.execute<{ n: string }>(sql`select nextval(${SEQUENCE[kind]}::regclass)::text as n`);
  return makeRef(kind, Number(res.rows[0]!.n), secret);
}
