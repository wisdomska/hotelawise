import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import { freshDb } from './db';

vi.mock('server-only', () => ({}));
vi.mock('@/server/admin/act', () => ({
  AdminError: class AdminError extends Error {
    constructor(
      message: string,
      readonly fields?: Record<string, string>,
    ) {
      super(message);
      this.name = 'AdminError';
    }
  },
}));
const sent: { to: string; text: string }[] = [];
let smsOn = true;
vi.mock('@/server/integrations/email', () => ({
  sendEmail: async (to: string, _subject: string, text: string) => void sent.push({ to, text }),
}));
vi.mock('@/server/integrations/sms', () => ({
  sendSms: async (to: string, text: string) => (smsOn ? (sent.push({ to, text }), true) : false),
}));

const P = await import('@/server/admin/payments');
const C = await import('@/server/admin/customers');
const I = await import('@/server/admin/inbox');

let h: Awaited<ReturnType<typeof freshDb>>;
const boss = { id: 'boss', name: 'Esi Asamoah' };
const TODAY = new Date().toISOString().slice(0, 10);
let abena: string;
let orderId: string;

beforeAll(async () => {
  h = await freshDb('admin_money_inbox');
  await h.db.insert(s.user).values([
    { id: 'boss', name: 'Esi Asamoah', email: 'esi@example.com', role: 'super_admin' },
    { id: 'kojo', name: 'Kojo Asante', email: 'kojo@example.com', jobTitle: 'Front desk' },
    { id: 'gone', name: 'Old Hand', email: 'old@example.com', banned: true },
  ]);
  const [a, b] = await h.db
    .insert(s.customers)
    .values([
      { name: 'Abena Owusu', phoneE164: '+233244123456', email: 'abena@example.com' },
      { name: 'Walk Away', phoneE164: '+233200000001' },
    ])
    .returning();
  abena = a!.id;
  void b;
  const [o] = await h.db
    .insert(s.rentalOrders)
    .values({
      ref: 'AWR-TEST1',
      publicToken: 'tok-1',
      customerId: abena,
      starts: TODAY,
      ends: TODAY,
      occasion: 'Wedding',
      payMode: 'at_pickup',
      collectorName: 'Abena Owusu',
      collectorPhoneE164: '+233244123456',
      status: 'collected',
      subtotalPesewas: 50_000,
      depositPesewas: 20_000,
      totalPesewas: 70_000,
      paidPesewas: 70_000,
    })
    .returning();
  orderId = o!.id;
  const [pay] = await h.db
    .insert(s.payments)
    .values([
      {
        ref: 'D-1',
        orderId,
        amountPesewas: 50_000,
        method: 'cash',
        channel: 'desk',
        status: 'success',
        paidAt: new Date(),
        byUserId: 'kojo',
      },
      { ref: 'D-2', orderId, amountPesewas: 20_000, method: 'mtn', channel: 'desk', status: 'success', paidAt: new Date() },
      { ref: 'D-3', orderId, amountPesewas: 9_999, method: 'mtn', channel: 'paystack', status: 'failed' },
    ])
    .returning();
  await h.db
    .insert(s.refunds)
    .values({ paymentId: pay!.id, amountPesewas: 15_000, reason: 'Deposit return', status: 'pending_approval', requestedBy: 'kojo' });
  await h.db.insert(s.newsletterSubscribers).values([{ email: 'one@example.com' }, { email: 'two@example.com' }]);
  await h.db.insert(s.messages).values([
    { fromName: 'Ama', contact: '+233244111222 · ama@example.com', subject: 'Reservation', body: 'Any rooms on Friday?' },
    { fromName: 'Yaw', contact: '+233244333444', subject: 'Feedback', body: 'Lovely stay.' },
  ]);
});
afterAll(async () => h?.drop());

describe('payments', () => {
  it('lists successful payments with filters and paging', async () => {
    const all = await P.listTransactions(h.db, { filter: 'all', page: 0 });
    expect(all.total).toBe(2);
    expect(all.rows[0]).toMatchObject({ ref: 'AWR-TEST1', who: 'Abena Owusu', kind: 'rental', channel: 'Desk' });
    expect((await P.listTransactions(h.db, { filter: 'paystack', page: 0 })).total).toBe(0);
    expect((await P.listTransactions(h.db, { filter: 'rooms', page: 0 })).total).toBe(0);
    expect((await P.allTransactions(h.db, 'rentals')).map((t) => t.method).sort()).toEqual(['Cash', 'MTN MoMo']);
  });

  it('adds up the day, deposits held and the refunds queue', async () => {
    const k = await P.paymentKpis(h.db, TODAY);
    expect(k).toEqual({ desk: 70_000, online: 0, deposits: { n: 1, held: 20_000 }, refunds: { n: 1, owed: 15_000 } });
    expect(await P.cashUp(h.db, TODAY)).toEqual([
      { method: 'Cash', channel: 'Desk', n: 1, amount: 50_000 },
      { method: 'MTN MoMo', channel: 'Desk', n: 1, amount: 20_000 },
    ]);
    const [d] = await P.depositsHeld(h.db);
    expect(d).toMatchObject({ ref: 'AWR-TEST1', held: 20_000 });
    const r = await P.listRefunds(h.db, 0);
    expect(r.rows[0]).toMatchObject({ ref: 'AWR-TEST1', by: 'Kojo Asante', status: 'Pending approval', pending: true, channel: 'Desk' });
  });
});

describe('customers', () => {
  it('lists only people with a stay, order or enquiry, and finds them by phone', async () => {
    const all = await C.listCustomers(h.db, { q: '', page: 0 });
    expect(all.rows.map((r) => r.name)).toEqual(['Abena Owusu']);
    expect(all.rows[0]).toMatchObject({ orders: 1, stays: 0, last: TODAY });
    expect((await C.listCustomers(h.db, { q: '0244 123', page: 0 })).total).toBe(1);
    expect((await C.listCustomers(h.db, { q: 'abena@', page: 0 })).total).toBe(1);
    expect((await C.listCustomers(h.db, { q: '100%', page: 0 })).total).toBe(0);
  });

  it('shows history and spend net of refunds, and saves notes', async () => {
    const d = await C.customerDetail(h.db, abena);
    expect(d).toMatchObject({ name: 'Abena Owusu', spend: 70_000 });
    expect(d!.history).toEqual([{ kind: 'rental', ref: 'AWR-TEST1', label: 'Wedding', date: TODAY, status: 'Collected' }]);
    await C.setCustomerNote(h.db, boss, abena, 'Prefers WhatsApp');
    expect((await C.customerDetail(h.db, abena))!.notes).toBe('Prefers WhatsApp');
  });

  it('unsubscribes newsletter readers once', async () => {
    const subs = await C.listSubscribers(h.db, 0);
    expect(subs.total).toBe(2);
    await C.removeSubscriber(h.db, boss, subs.rows[0]!.id);
    await expect(C.removeSubscriber(h.db, boss, subs.rows[0]!.id)).rejects.toThrow('already been removed');
    expect((await C.allSubscribers(h.db)).length).toBe(1);
  });
});

describe('inbox', () => {
  it('assigns, changes status and replies by email or SMS', async () => {
    const [ama, yaw] = (await I.listMessages(h.db)).sort((a, b) => a.from.localeCompare(b.from));
    expect(ama).toMatchObject({ phone: '+233244111222', email: 'ama@example.com', status: 'new' });
    expect((await I.assignees(h.db)).map((u) => u.id)).toEqual(['boss', 'kojo']);
    await expect(I.assignMessage(h.db, boss, ama!.id, 'gone')).rejects.toThrow('can’t take messages');
    await I.assignMessage(h.db, boss, ama!.id, 'kojo');
    let [m] = await h.db.select().from(s.messages).where(eq(s.messages.id, ama!.id));
    expect(m).toMatchObject({ status: 'assigned', assigneeId: 'kojo' });
    await I.assignMessage(h.db, boss, ama!.id, null);
    [m] = await h.db.select().from(s.messages).where(eq(s.messages.id, ama!.id));
    expect(m!.status).toBe('new');

    const out = await I.replyToMessage(h.db, boss, ama!.id, 'Yes, we have rooms.', 'Esi, Hotel A-Wise');
    expect(out).toEqual({ channel: 'email', to: 'ama@example.com' });
    expect(sent.at(-1)).toMatchObject({ to: 'ama@example.com' });

    smsOn = false;
    await expect(I.replyToMessage(h.db, boss, yaw!.id, 'Thanks!', 'Esi')).rejects.toThrow('aren’t switched on');
    smsOn = true;
    await I.replyToMessage(h.db, boss, yaw!.id, 'Thanks!', 'Esi');
    await I.setMessageStatus(h.db, boss, yaw!.id, 'closed');

    const after = await I.listMessages(h.db);
    expect(after.find((x) => x.id === ama!.id)).toMatchObject({ status: 'replied', replies: [{ by: 'Esi Asamoah', channel: 'email' }] });
    expect(after.find((x) => x.id === yaw!.id)).toMatchObject({ status: 'closed', replies: [{ channel: 'sms' }] });
    const log = await h.db.select({ a: s.auditLog.action }).from(s.auditLog).where(eq(s.auditLog.entity, 'message'));
    expect(log.map((l) => l.a)).toContain('Replied to message');
  });
});
