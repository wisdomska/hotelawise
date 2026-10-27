import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import * as s from '@/server/db/schema';
import { freshDb } from './db';

vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, revalidateTag: () => {} }));

const { defaultSiteData } = await import('@/server/content/site-data');
const I = await import('@/server/services/invoices');

let h: Awaited<ReturnType<typeof freshDb>>;
const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

beforeAll(async () => {
  h = await freshDb('invoices');
  const [t] = await h.db
    .insert(s.roomTypes)
    .values({ code: 'VIP', name: 'VIP', beds: 'Large double', sleeps: 2, bathroom: 'En-suite' })
    .returning();
  const [v] = await h.db
    .insert(s.rateVariants)
    .values({ roomTypeId: t!.id, code: 'VIP', displayCode: 'VIP', name: 'VIP', pricePesewas: 30000 })
    .returning();
  const [room] = await h.db.insert(s.rooms).values({ number: '206', rateVariantId: v!.id }).returning();
  const [c] = await h.db
    .insert(s.customers)
    .values({ name: 'Ama Mensah', phoneE164: '+233244123456', email: 'ama@example.com' })
    .returning();
  const [b] = await h.db
    .insert(s.bookings)
    .values({
      ref: 'AW-7K2Q',
      publicToken: 'tok_booking_0123456789',
      customerId: c!.id,
      rateVariantId: v!.id,
      roomId: room!.id,
      checkIn: '2026-11-02',
      checkOut: '2026-11-04',
      guests: 2,
      status: 'confirmed',
      totalPesewas: 64000,
      paidPesewas: 30000,
    })
    .returning();
  await h.db.insert(s.bookingCharges).values([
    { bookingId: b!.id, kind: 'room', description: 'VIP Room × 2 nights', unitPesewas: 60000 },
    { bookingId: b!.id, kind: 'room_service', description: 'Room service', unitPesewas: 4000 },
  ]);
  await h.db.insert(s.payments).values({
    ref: 'PAY-1',
    bookingId: b!.id,
    amountPesewas: 30000,
    method: 'mtn',
    channel: 'paystack',
    status: 'success',
    paidAt: new Date('2026-10-26T10:00:00Z'),
  });
  // A hold has no invoice.
  await h.db.insert(s.bookings).values({
    publicToken: 'tok_hold_0123456789ab',
    rateVariantId: v!.id,
    checkIn: '2026-11-02',
    checkOut: '2026-11-03',
    status: 'held',
  });

  const [item] = await h.db
    .insert(s.rentalItems)
    .values({ slug: 'chair', name: 'Regular chair', pricePerDayPesewas: 300, depositPerUnitPesewas: 500, stockTotal: 200 })
    .returning();
  const [o] = await h.db
    .insert(s.rentalOrders)
    .values({
      ref: 'AWR-9PX4',
      publicToken: 'tok_order_0123456789',
      customerId: c!.id,
      starts: '2026-11-07',
      ends: '2026-11-08',
      payMode: 'online',
      collectorName: 'Ama Mensah',
      collectorPhoneE164: '+233244123456',
      status: 'reserved',
      subtotalPesewas: 30000,
      depositPesewas: 25000,
      totalPesewas: 55000,
      paidPesewas: 55000,
    })
    .returning();
  await h.db.insert(s.orderLines).values({ orderId: o!.id, itemId: item!.id, qty: 50, unitPesewas: 300, depositPesewas: 500, days: 2 });
  await h.db
    .insert(s.payments)
    .values({ ref: 'PAY-2', orderId: o!.id, amountPesewas: 55000, method: 'card', channel: 'paystack', status: 'success' });
});
afterAll(async () => h?.drop());

describe('invoices', () => {
  it('prints a booking with a balance as an invoice', async () => {
    const inv = (await I.bookingInvoice(h.db, { token: 'tok_booking_0123456789' }))!;
    expect(inv).toMatchObject({ ref: 'AW-7K2Q', total: 64000, paid: 30000, refunded: 0, status: 'Confirmed' });
    expect(inv.details[0]).toEqual(['Room', 'VIP · Room 206']);
    expect(inv.payments).toEqual([{ at: new Date('2026-10-26T10:00:00Z'), method: 'MTN MoMo', amount: 30000 }]);
    expect(I.invoiceTitle(inv)).toBe('Invoice');
    const pdf = latin1(I.renderInvoice(inv, defaultSiteData(), '2026-10-26'));
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    for (const t of [
      '(INVOICE)',
      '(AW-7K2Q)',
      '(Ama Mensah)',
      '(Room service)',
      '(GHS 640.00)',
      '(Balance due)',
      '(GHS 340.00)',
      '(MTN MoMo)',
    ])
      expect(pdf).toContain(t);
    expect(pdf).toContain('Prices include VAT 15%, NHIL 2.5%, GETFund 2.5% and Tourism levy 1%.');
    expect(await I.bookingInvoice(h.db, { ref: 'AW-7K2Q' })).toMatchObject({ ref: 'AW-7K2Q' });
  });

  it('prints a paid rental order as a receipt with the deposit', async () => {
    const inv = (await I.orderInvoice(h.db, { ref: 'AWR-9PX4' }))!;
    expect(I.invoiceTitle(inv)).toBe('Receipt');
    expect(inv.lines).toEqual([
      { label: 'Regular chair × 50', amount: 30000, note: '2 days' },
      { label: 'Security deposit (refundable)', amount: 25000 },
    ]);
    const pdf = latin1(I.renderInvoice(inv, defaultSiteData(), '2026-10-26'));
    for (const t of ['(RECEIPT)', '(PAID IN FULL)', '(Regular chair \xd7 50)', '(Card)']) expect(pdf).toContain(t);
    expect(await I.orderInvoice(h.db, { token: 'tok_order_0123456789' })).toMatchObject({ ref: 'AWR-9PX4' });
  });

  it('has nothing for holds or unknown tokens', async () => {
    expect(await I.bookingInvoice(h.db, { token: 'tok_hold_0123456789ab' })).toBeNull();
    expect(await I.bookingInvoice(h.db, { token: 'nope' })).toBeNull();
    expect(await I.orderInvoice(h.db, { token: 'nope' })).toBeNull();
    expect(await I.orderInvoice(h.db, { ref: 'AWR-NONE' })).toBeNull();
  });

  it('spills long orders onto a second page', () => {
    const inv: Parameters<typeof I.renderInvoice>[0] = {
      kind: 'rental',
      ref: 'AWR-LONG',
      status: 'Reserved',
      billTo: { name: 'Kofi', phone: '', email: null },
      details: [],
      lines: Array.from({ length: 60 }, (_, i) => ({ label: `Item ${i + 1}`, amount: 1000 })),
      adjustments: [],
      total: 60000,
      paid: 0,
      refunded: 0,
      payments: [],
    };
    const pdf = latin1(I.renderInvoice(inv, defaultSiteData()));
    expect(pdf).toMatch(/\/Count [2-9]/);
    expect(pdf).toContain('(AWR-LONG \xb7 page 2)');
  });

  it('formats money with pesewas and builds the tax note from settings', () => {
    expect(I.ghs(123450)).toBe('GHS 1,234.50');
    expect(I.ghs(-500)).toBe('- GHS 5.00');
    const d = defaultSiteData();
    expect(I.taxNote({ ...d, settings: { ...d.settings, 'tax.included': false } })).toBeNull();
  });
});
