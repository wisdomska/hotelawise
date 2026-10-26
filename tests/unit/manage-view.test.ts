import { describe, expect, it } from 'vitest';
import type { GuestBooking } from '@/server/services/bookings';
import { manageView } from '@/server/services/manage-view';

const b = (over: Partial<GuestBooking> = {}): GuestBooking => ({
  id: 'b1',
  ref: 'AW-7KQ2',
  token: 'tok',
  status: 'confirmed',
  paymentStatus: 'deposit',
  payMode: 'deposit',
  variantCode: 'EXE_PLUS',
  typeCode: 'EXE',
  typeName: 'Executive',
  variantName: 'Executive Plus',
  checkIn: '2027-03-05',
  checkOut: '2027-03-07',
  nights: 2,
  guests: 2,
  guestName: 'Kofi Mensah',
  phone: '+233244123456',
  email: null,
  arrivalHour: null,
  breakfast: true,
  lines: [
    { label: 'EXE+ × 2', amount: 50000 },
    { label: 'BREAKFAST × 2 × 2', amount: 20000 },
  ],
  discount: 2000,
  promoCode: 'NIGHTOWL',
  total: 68000,
  paid: 30000,
  lastMethod: 'mtn',
  refundPending: 0,
  holdExpiresAt: null,
  ...over,
});
const opts = (now: string) => ({ now: new Date(now), freeHours: 48, depositPercent: 30, checkInTime: '14:00', deskPhone: '055 555 7090' });
const EARLY = opts('2027-02-20T09:00:00Z');
const LATE = opts('2027-03-04T09:00:00Z');

describe('manageView', () => {
  it('builds the receipt lines and the free-cancellation wording well before check-in', () => {
    const v = manageView(b(), EARLY);
    expect(v).toMatchObject({
      ref: 'AW-7KQ2',
      status: 'Confirmed',
      statusBg: '#F6E2B3',
      title: 'Executive room',
      typeName: 'Executive Plus',
      range: 'Fri 5 Mar → Sun 7 Mar',
      guestsLabel: '2 guests',
      active: true,
      cancelled: false,
      locked: false,
      policyNote: "Free cancellation until Wed 3 Mar, 2pm. You'd get the full GHS 300 back.",
      cancelBody: "You're more than 48 hours out, so this one's free. We'll refund the full GHS 300 to MTN MoMo.",
    });
    expect(v.lines.map((l) => [l.k, l.v])).toEqual([
      ['EXE+ × 2 nights', 'GHS 500'],
      ['EXTRAS', 'GHS 200'],
      ['PROMO NIGHTOWL', '− GHS 20'],
      ['TOTAL', 'GHS 680'],
      ['PAID · MTN MOMO', 'GHS 300'],
      ['BALANCE AT THE DESK', 'GHS 380'],
    ]);
  });

  it('keeps the deposit inside the free window and refunds the rest', () => {
    const v = manageView(b(), LATE);
    expect(v.policyNote).toBe("You're inside 48 hours of check-in, so the GHS 210 deposit is kept if you cancel.");
    expect(v.cancelBody).toBe("You're inside 48 hours of check-in, so we keep the GHS 210 deposit and refund GHS 90 to MTN MoMo.");
    expect(manageView(b({ paid: 21000 }), LATE).cancelBody).toBe("You're inside 48 hours of check-in, so we keep the GHS 210 deposit.");
  });

  it('says nothing is refunded when nothing was paid, and handles a plain one-night stay', () => {
    const v = manageView(
      b({
        paid: 0,
        lastMethod: null,
        status: 'pending_payment',
        nights: 1,
        guests: 1,
        discount: 0,
        promoCode: null,
        lines: [{ label: 'STD', amount: 15000 }],
        total: 15000,
        variantCode: 'STD',
      }),
      EARLY,
    );
    expect(v.status).toBe('Pending payment');
    expect(v.statusFg).toBe('#7A4E00');
    expect(v.guestsLabel).toBe('1 guest');
    expect(v.policyNote).toBe('Free cancellation until Wed 3 Mar, 2pm.');
    expect(v.cancelBody).toBe(
      "Nothing has been paid on this booking, so there's nothing to refund. The room goes back on sale straight away.",
    );
    expect(v.lines.map((l) => l.k)).toEqual(['STD × 1 night', 'TOTAL', 'PAID', 'BALANCE AT THE DESK']);
  });

  it('describes cancelled bookings with and without a refund on the way', () => {
    const pending = manageView(b({ status: 'cancelled', refundPending: 30000, lastMethod: null }), EARLY);
    expect(pending).toMatchObject({ cancelled: true, active: false, statusBg: '#FBE9E7', status: 'Cancelled' });
    expect(pending.cancelNote).toBe(
      "Cancelled. GHS 300 is on its way back to the way you paid, usually within 1–3 working days. We'll text you when it lands.",
    );
    expect(manageView(b({ status: 'expired' }), EARLY).cancelNote).toBe('This booking is cancelled. We hope to see you another time.');
  });

  it('locks stays that have started or ended, pointing to the desk', () => {
    expect(manageView(b({ status: 'checked_in' }), LATE)).toMatchObject({
      locked: true,
      status: 'Checked-in',
      lockNote: "You're checked in, so changes go through the front desk. Call 055 555 7090 or ask at reception.",
    });
    const ended = manageView(b({ status: 'no_show' }), LATE);
    expect([ended.status, ended.lockNote]).toEqual([
      'No-show',
      "This stay has ended, so it can't be changed online. Questions? Call 055 555 7090.",
    ]);
    expect(manageView(b({ ref: null }), opts('2027-02-20T09:00:00Z')).ref).toBe('');
  });

  it('labels a morning check-in time', () => {
    expect(manageView(b(), { ...EARLY, checkInTime: '09:00' }).policyNote).toContain('Wed 3 Mar, 9am');
  });
});
