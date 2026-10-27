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

const C = await import('@/server/admin/content');
const S = await import('@/server/admin/settings');
const R = await import('@/server/admin/reports');
const U = await import('@/server/admin/cloudinary');

let h: Awaited<ReturnType<typeof freshDb>>;
const who = { id: 'esi', name: 'Esi Asamoah' };
const today = '2026-10-26';

beforeAll(async () => {
  h = await freshDb('admin_content');
  await h.db.insert(s.user).values({ id: who.id, name: who.name, email: 'esi@example.com', role: 'super_admin' });
  await h.db.insert(s.venues).values([
    { slug: 'compound', name: 'Event compound', hirePesewas: 250_000, capacityMin: 100, capacityMax: 200, position: 0 },
    { slug: 'conference', name: 'Conference room', hirePesewas: 80_000, position: 1 },
  ]);
  const [t] = await h.db
    .insert(s.roomTypes)
    .values({ code: 'STD', name: 'Standard', beds: '1 queen', sleeps: 2, bathroom: 'En-suite' })
    .returning();
  const [v] = await h.db
    .insert(s.rateVariants)
    .values({ roomTypeId: t!.id, code: 'STD', displayCode: 'STD', name: 'Standard', pricePesewas: 15_000 })
    .returning();
  const [room] = await h.db.insert(s.rooms).values({ number: '101', rateVariantId: v!.id }).returning();
  const [cust] = await h.db.insert(s.customers).values({ name: 'Ama Owusu', phoneE164: '+233244000111' }).returning();
  const [b] = await h.db
    .insert(s.bookings)
    .values({
      ref: 'AW-T1',
      publicToken: 'tok-1',
      customerId: cust!.id,
      rateVariantId: v!.id,
      roomId: room!.id,
      checkIn: '2026-10-20',
      checkOut: '2026-10-23',
      status: 'checked_out',
      source: 'phone',
      subtotalPesewas: 45_000,
      totalPesewas: 45_000,
      paidPesewas: 45_000,
      createdAt: new Date('2026-10-19T10:00:00Z'),
    })
    .returning();
  await h.db.insert(s.payments).values({
    ref: 'DESK-1',
    bookingId: b!.id,
    amountPesewas: 45_000,
    method: 'cash',
    channel: 'desk',
    status: 'success',
    byUserId: who.id,
    paidAt: new Date('2026-10-20T10:00:00Z'),
    createdAt: new Date('2026-10-20T10:00:00Z'),
  });
  const [item] = await h.db
    .insert(s.rentalItems)
    .values({ slug: 'chair', name: 'Regular chair', pricePerDayPesewas: 300, stockTotal: 100 })
    .returning();
  const [o] = await h.db
    .insert(s.rentalOrders)
    .values({
      ref: 'AWR-T1',
      publicToken: 'tok-o',
      customerId: cust!.id,
      starts: '2026-10-24',
      ends: '2026-10-25',
      occasion: 'Wedding',
      payMode: 'online',
      collectorName: 'Ama Owusu',
      collectorPhoneE164: '+233244000111',
      status: 'collected',
      subtotalPesewas: 30_000,
      depositPesewas: 0,
      totalPesewas: 30_000,
      createdAt: new Date('2026-10-22T10:00:00Z'),
    })
    .returning();
  await h.db.insert(s.orderLines).values({ orderId: o!.id, itemId: item!.id, qty: 50, unitPesewas: 300, depositPesewas: 0, days: 2 });
});
afterAll(async () => h?.drop());

describe('content', () => {
  it('saves copy, rejects unknown keys and audits', async () => {
    await C.saveCopy(h.db, who, 'Hero', { 'home.heroTitle': '  Sleep well in Accra ' });
    const data = await C.contentData(h.db);
    expect(data.copy['home.heroTitle']).toBe('Sleep well in Accra');
    expect(data.copy['home.heroSub']).toBe('');
    await expect(C.saveCopy(h.db, who, 'X', { 'evil.key': 'x' })).rejects.toThrow(/can’t be edited/);
    const log = await h.db.select().from(s.auditLog).where(eq(s.auditLog.action, 'Edited content'));
    expect(log[0]!.after).toEqual({ 'home.heroTitle': '  Sleep well in Accra ' });
  });

  it('replaces and resets a photo slot, refusing foreign IDs', async () => {
    await expect(C.setSlotPhoto(h.db, who, 'hero', 'someone/else')).rejects.toThrow(/wasn’t recognised/);
    await expect(C.setSlotPhoto(h.db, who, 'nope', null)).rejects.toThrow(/doesn’t exist/);
    await C.setSlotPhoto(h.db, who, 'hero', 'hotel-a-wise/uploads/photos/abc123');
    let p = (await C.contentData(h.db)).photo.hero!;
    expect(p).toMatchObject({ id: 'hotel-a-wise/uploads/photos/abc123', custom: true });
    await C.setSlotPhoto(h.db, who, 'hero', null);
    p = (await C.contentData(h.db)).photo.hero!;
    expect(p.custom).toBe(false);
    expect(p.id).toBe('hotel-a-wise/rooms/executive-bedroom');
  });

  it('adds gallery photos hidden, publishes them with alt text, reorders and deletes', async () => {
    await C.addGalleryPhotos(h.db, who, ['hotel-a-wise/uploads/gallery/a', 'hotel-a-wise/uploads/gallery/b']);
    let g = (await C.contentData(h.db)).gallery;
    expect(g.map((x) => x.imageId)).toEqual(['hotel-a-wise/uploads/gallery/a', 'hotel-a-wise/uploads/gallery/b']);
    expect(g.every((x) => !x.published)).toBe(true);
    await expect(C.updateGalleryItem(h.db, who, g[0]!.id, { alt: ' ', category: 'Rooms', published: true })).rejects.toThrow(/alt text/);
    await C.updateGalleryItem(h.db, who, g[0]!.id, { alt: 'Porch at dusk', category: 'Spaces', published: true });
    expect(await C.moveItem(h.db, who, 'gallery', g[0]!.id, -1)).toBe(false);
    expect(await C.moveItem(h.db, who, 'gallery', g[0]!.id, 1)).toBe(true);
    g = (await C.contentData(h.db)).gallery;
    expect(g.map((x) => x.imageId)).toEqual(['hotel-a-wise/uploads/gallery/b', 'hotel-a-wise/uploads/gallery/a']);
    expect(g[1]).toMatchObject({ alt: 'Porch at dusk', published: true });
    await C.deleteGalleryItem(h.db, who, g[0]!.id);
    expect((await C.contentData(h.db)).gallery).toHaveLength(1);
  });

  it('manages FAQs and testimonials in order', async () => {
    await expect(C.saveFaq(h.db, who, { id: null, q: 'x', a: 'y', published: true })).rejects.toMatchObject({
      fields: { q: expect.any(String), a: expect.any(String) },
    });
    await C.saveFaq(h.db, who, { id: null, q: 'Is there parking?', a: 'Yes, in the compound.', published: true });
    await C.saveFaq(h.db, who, { id: null, q: 'Do you serve dinner?', a: 'Room service until late.', published: false });
    let f = (await C.contentData(h.db)).faqs;
    expect(f.map((x) => x.q)).toEqual(['Is there parking?', 'Do you serve dinner?']);
    await C.moveItem(h.db, who, 'faq', f[1]!.id, -1);
    f = (await C.contentData(h.db)).faqs;
    expect(f[0]!.q).toBe('Do you serve dinner?');
    await C.saveFaq(h.db, who, { id: f[0]!.id, q: f[0]!.q, a: 'Room service until midnight.', published: true });
    await C.deleteFaq(h.db, who, f[1]!.id);
    f = (await C.contentData(h.db)).faqs;
    expect(f).toEqual([expect.objectContaining({ a: 'Room service until midnight.', published: true })]);

    await C.saveTestimonial(h.db, who, { id: null, quote: '“Spotless.”', from: 'Kofi · Kumasi', live: false });
    const [t] = (await C.contentData(h.db)).testimonials;
    expect(t).toMatchObject({ quote: 'Spotless.', live: false });
    expect(await C.setTestimonialLive(h.db, who, t!.id, true)).toBe('Kofi · Kumasi');
    expect((await C.contentData(h.db)).testimonials[0]!.live).toBe(true);
    await C.deleteTestimonial(h.db, who, t!.id);
    expect((await C.contentData(h.db)).testimonials).toHaveLength(0);
  });

  it('edits only the venue fields sent', async () => {
    await C.saveVenueText(h.db, who, 'compound', { label: 'Outdoor · gated', max: 250 });
    const v = (await C.contentData(h.db)).venues.find((x) => x.slug === 'compound')!;
    expect(v).toMatchObject({ name: 'Event compound', label: 'Outdoor · gated', min: 100, max: 250 });
    await expect(C.saveVenueText(h.db, who, 'compound', { min: 300 })).rejects.toThrow(/above the largest/);
  });
});

describe('settings', () => {
  it('shows defaults, converts money and validates each kind', async () => {
    let f = await S.settingsForm(h.db);
    expect(f['fees.roomServicePesewas']).toBe('20');
    expect(f['security.requireTwoFactor']).toBe(false);
    await S.saveSettings(h.db, who, 'Stay & services', { 'fees.roomServicePesewas': '25.50', 'hotel.checkIn': '13:00' });
    await S.saveSettings(h.db, who, 'Contact details', { 'contact.phone': '0244 123 456', 'contact.phone2': '+233 54 012 0400' });
    f = await S.settingsForm(h.db);
    expect(f).toMatchObject({
      'fees.roomServicePesewas': '25.5',
      'hotel.checkIn': '13:00',
      'contact.phone': '+233244123456',
      'contact.phone2': '+233540120400',
    });
    const [row] = await h.db.select().from(s.settings).where(eq(s.settings.key, 'fees.roomServicePesewas'));
    expect(row!.value).toBe(2550);
    await expect(
      S.saveSettings(h.db, who, 'X', {
        'hotel.checkOut': '25:00',
        'admin.sessionTimeoutMinutes': '2',
        'contact.email': 'nope',
        'tax.vatPercent': '',
        'contact.phone3': '',
      }),
    ).rejects.toMatchObject({
      fields: {
        'hotel.checkOut': expect.any(String),
        'admin.sessionTimeoutMinutes': expect.any(String),
        'contact.email': expect.any(String),
        'tax.vatPercent': expect.any(String),
        'contact.phone3': expect.any(String),
      },
    });
    await expect(S.saveSettings(h.db, who, 'Banner', { 'contact.email': 'a@b.co' }, S.BANNER_KEYS)).rejects.toThrow(
      /can’t be changed here/,
    );
    await expect(S.saveSettings(h.db, who, 'X', { 'booking.holdMinutes': '5' } as never)).rejects.toThrow(/can’t be changed here/);
  });

  it('masks Paystack keys and never reveals the whole secret', () => {
    process.env.PAYSTACK_SECRET_KEY = 'sk_test_abcdefghijklmnop1234';
    process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY = 'pk_test_zyxwvutsrqponm9876';
    const hidden = S.paystackKeys(false);
    expect(hidden.mode).toBe('Test');
    expect(hidden.public).not.toContain('zyxw');
    expect(hidden.secret).not.toContain('1234');
    const shown = S.paystackKeys(true);
    expect(shown.public).toBe('pk_test_zyxwvutsrqponm9876');
    expect(shown.secret).toMatch(/^sk_test_•+1234$/);
  });
});

describe('reports', () => {
  it('summarises rooms, rentals and staff for 30 days', async () => {
    const rooms = await R.roomsReport(h.db, today);
    expect(rooms.nightsSold).toBe(3);
    expect(rooms.adr).toBe(15_000);
    expect(rooms.byType).toEqual([['Standard', 45_000]]);
    expect(rooms.bySource.find(([k]) => k === 'Phone')![1]).toBe(1);
    const rentals = await R.rentalsReport(h.db, today);
    expect(rentals.orders).toBe(1);
    expect(rentals.items).toEqual([['Regular chair', 100]]);
    expect(rentals.occasions).toEqual([['Wedding', 1]]);
    expect(rentals.utilisation).toBeGreaterThan(0);
    const staff = await R.staffReport(h.db, today);
    expect(staff[0]).toMatchObject({ name: 'Esi Asamoah', payments: 1 });
  });

  it('exports CSV rows and neutralises spreadsheet formulas', async () => {
    const rows = await R.reportCsv(h.db, 'Rooms', today);
    expect(rows[1]).toEqual([
      'AW-T1',
      'Ama Owusu',
      'Standard',
      '101',
      '2026-10-20',
      3,
      'phone',
      'checked_out',
      '450.00',
      '450.00',
      expect.any(String),
    ]);
    expect((await R.reportCsv(h.db, 'Rentals', today))[1]![0]).toBe('AWR-T1');
    expect(R.toCsv([['=1+1', 'a"b']])).toBe(`"'=1+1","a""b"`);
  });
});

describe('cloudinary', () => {
  it('signs uploads into our folder only', async () => {
    Object.assign(process.env, {
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgres://x@localhost/x',
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? 'x'.repeat(32),
      REF_SECRET: process.env.REF_SECRET ?? 'x'.repeat(16),
      CLOUDINARY_CLOUD_NAME: 'demo',
      CLOUDINARY_API_KEY: 'key',
      CLOUDINARY_API_SECRET: 'secret',
    });
    const sig = await U.signUpload('gallery', 1_700_000_000_000);
    expect(sig).toMatchObject({
      folder: 'hotel-a-wise/uploads/gallery',
      timestamp: 1_700_000_000,
      url: 'https://api.cloudinary.com/v1_1/demo/image/upload',
    });
    expect(sig!.signature).toMatch(/^[0-9a-f]{40}$/);
    expect(U.isUploadedId('hotel-a-wise/uploads/gallery/x1')).toBe(true);
    expect(U.isUploadedId('hotel-a-wise/uploads/gallery/x1', 'photos')).toBe(false);
    expect(U.isUploadedId('hotel-a-wise/uploads/../x')).toBe(false);
  });
});
