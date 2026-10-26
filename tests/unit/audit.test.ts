import { describe, expect, it } from 'vitest';
import { audit, diff } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';

describe('audit diff', () => {
  it('keeps only the fields that changed, including added and removed ones', () => {
    expect(diff({ price: 24000, name: 'VIP', gone: 1 }, { price: 25000, name: 'VIP', added: true })).toEqual({
      before: { price: 24000, gone: 1, added: undefined },
      after: { price: 25000, gone: undefined, added: true },
    });
  });

  it('passes creations and deletions through whole', () => {
    expect(diff(null, { a: 1 })).toEqual({ before: null, after: { a: 1 } });
    expect(diff({ a: 1 }, undefined)).toEqual({ before: { a: 1 }, after: null });
  });
});

describe('audit', () => {
  function fakeDb() {
    const rows: Record<string, unknown>[] = [];
    const db = { insert: () => ({ values: async (v: Record<string, unknown>) => void rows.push(v) }) } as unknown as AnyDb;
    return { db, rows };
  }

  it('names system, guest and staff actors and fills optional fields with null', async () => {
    const { db, rows } = fakeDb();
    await audit(db, { actor: 'system', action: 'hold.expired', entity: 'booking' });
    await audit(db, { actor: 'guest', action: 'booking.cancel', entity: 'booking', entityId: 'b1', target: 'AW-7KQ2', ip: '1.2.3.4' });
    await audit(db, {
      actor: { id: 'u1', name: 'Esi Asamoah' },
      action: 'rate.update',
      entity: 'rate_variant',
      before: { price: 1 },
      after: { price: 2 },
    });
    expect(rows.map((r) => [r.userId, r.actorName])).toEqual([
      [null, 'System'],
      [null, 'Guest (online)'],
      ['u1', 'Esi Asamoah'],
    ]);
    expect(rows[0]).toMatchObject({ entityId: null, target: null, before: null, after: null, ip: null });
    expect(rows[1]).toMatchObject({ entityId: 'b1', target: 'AW-7KQ2', ip: '1.2.3.4' });
    expect(rows[2]).toMatchObject({ before: { price: 1 }, after: { price: 2 } });
  });
});
