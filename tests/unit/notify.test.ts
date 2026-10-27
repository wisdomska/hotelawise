import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GuestBooking } from '@/server/services/bookings';
import type { GuestOrder } from '@/server/services/rentals';

vi.mock('server-only', () => ({}));
const sendSms = vi.fn();
const sendEmail = vi.fn();
vi.mock('@/server/integrations/sms', () => ({ sendSms: (...a: unknown[]) => sendSms(...a) }));
vi.mock('@/server/integrations/email', () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock('@/server/platform/env', () => ({ env: () => ({ APP_URL: 'https://hotelawise.com' }) }));

const n = await import('@/server/services/notify');

const contact = { phone: '055 555 7090', email: 'desk@hotelawise.com' };
const booking = (over: Partial<GuestBooking> = {}): GuestBooking => ({
  id: 'b1',
  ref: 'AW-7KQ2',
  token: 'tok123',
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
  guestName: 'Kofi  Mensah',
  phone: '+233244123456',
  email: 'kofi@example.com',
  arrivalHour: 22,
  breakfast: true,
  lines: [
    { label: 'EXE+ × 2', amount: 50000 },
    { label: 'BREAKFAST × 2 × 2', amount: 20000 },
  ],
  discount: 2000,
  promoCode: 'NIGHTOWL',
  total: 68000,
  paid: 20000,
  lastMethod: 'mtn',
  refundPending: 0,
  holdExpiresAt: null,
  ...over,
});
const order = (over: Partial<GuestOrder> = {}): GuestOrder => ({
  id: 'o1',
  ref: 'AWR-NYMZ',
  token: 'otok',
  status: 'reserved',
  payMode: 'at_pickup',
  starts: '2027-05-08',
  ends: '2027-05-09',
  days: 2,
  collectorName: 'Abena Owusu',
  phone: '+233244123456',
  email: 'abena@example.com',
  occasion: 'Wedding',
  lines: [{ name: 'Canopy', qty: 2, amount: 100000 }],
  subtotal: 100000,
  discount: 5000,
  deposit: 20000,
  total: 115000,
  paid: 0,
  ...over,
});

beforeEach(() => {
  sendSms.mockReset().mockResolvedValue(true);
  sendEmail.mockReset().mockResolvedValue(true);
});

describe('message helpers', () => {
  it('fills known template slots and leaves unknown ones visible', () => {
    expect(n.fillTemplate('Hi {first_name}, ref {ref} {nope}', { first_name: 'Kofi', ref: 'AW-1' })).toBe('Hi Kofi, ref AW-1 {nope}');
  });

  it('masks Ghana and foreign numbers and email addresses', () => {
    expect(n.maskPhone('+233244123456')).toBe('024 ••• ••56');
    expect(n.maskPhone('+447700900123')).toBe('+••••••••••23');
    expect(n.maskEmail('kofi@example.com')).toBe('k•••@example.com');
  });
});

describe('booking messages', () => {
  it('texts the filled template and emails the full receipt with links', async () => {
    await n.bookingConfirmed(booking(), contact, 'Hi {first_name}! {room} {check_in}–{check_out}. Ref {ref}. {phone}');
    expect(sendSms).toHaveBeenCalledWith('+233244123456', 'Hi Kofi! Executive Plus Room 5 Mar–7 Mar. Ref AW-7KQ2. 055 555 7090');
    const [to, subject, text] = sendEmail.mock.calls[0]!;
    expect([to, subject]).toEqual(['kofi@example.com', "You're booked: AW-7KQ2"]);
    expect(text).toContain('(2 nights), 2 guests');
    expect(text).toContain('Promo NIGHTOWL: −GHS 20');
    expect(text).toContain('Balance at the desk: GHS 480');
    expect(text).toContain('Your booking: https://hotelawise.com/book/confirmation/tok123');
    expect(text).toContain('Change or cancel: https://hotelawise.com/manage?ref=AW-7KQ2');
  });

  it('skips email when the guest gave none, and survives a failing sender', async () => {
    sendSms.mockRejectedValue(new Error('Arkesel down'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      n.bookingConfirmed(booking({ email: null, nights: 1, guests: 1, discount: 0 }), contact, '{ref}'),
    ).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(err).toHaveBeenCalledWith('notify: booking SMS failed', expect.any(Error));
    err.mockRestore();
  });

  it('words a cancellation with and without a refund', async () => {
    await n.bookingCancelled(booking(), 20000, 'MTN MoMo', contact);
    expect(sendSms.mock.calls[0]![1]).toBe(
      "Hotel A-Wise: booking AW-7KQ2 is cancelled. GHS 200 is on its way back to MTN MoMo, usually within 1–3 working days. We'll text you when it lands.",
    );
    expect(sendEmail.mock.calls[0]!.slice(0, 2)).toEqual(['kofi@example.com', 'Cancelled: AW-7KQ2']);
    await n.bookingCancelled(booking({ email: null }), 0, 'cash', contact);
    expect(sendSms.mock.calls[1]![1]).toBe('Hotel A-Wise: booking AW-7KQ2 is cancelled. We hope to see you another time. 055 555 7090');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('tells the guest the new dates and anything still due', async () => {
    await n.datesChanged(booking(), contact);
    expect(sendSms.mock.calls[0]![1]).toBe(
      'Hotel A-Wise: booking AW-7KQ2 now runs Fri 5 Mar to Sun 7 Mar. New total GHS 680, GHS 480 due at check-in. 055 555 7090',
    );
    expect(sendEmail.mock.calls[0]![2]).toContain('https://hotelawise.com/book/confirmation/tok123');
    await n.datesChanged(booking({ paid: 68000, email: null }), contact);
    expect(sendSms.mock.calls[1]![1]).not.toContain('due at check-in');
  });

  it('apologises for a late payment refund', async () => {
    await n.lateRefund(booking(), 68000, contact);
    expect(sendSms.mock.calls[0]![1]).toContain('your payment of GHS 680 arrived after your 15-minute hold ended');
    expect(sendEmail.mock.calls[0]![1]).toBe('Your payment has been refunded');
    await n.lateRefund(booking({ email: null }), 100, contact);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('prefixes staff alerts', async () => {
    await n.staffAlert('desk@hotelawise.com', 'Late payment', 'details');
    expect(sendEmail).toHaveBeenCalledWith('desk@hotelawise.com', '[A-Wise] Late payment', 'details');
  });
});

describe('guest codes', () => {
  it('reports where the code went, masked', async () => {
    await expect(n.guestCode('+233244123456', 'kofi@example.com', '123456')).resolves.toEqual(['024 ••• ••56', 'k•••@example.com']);
    expect(sendSms.mock.calls[0]![1]).toBe("Your Hotel A-Wise code is 123456. It works for 10 minutes. Don't share it with anyone.");
    expect(sendEmail.mock.calls[0]![1]).toBe('Your Hotel A-Wise code: 123456');
  });

  it('leaves out channels that did not deliver', async () => {
    sendSms.mockResolvedValue(false);
    await expect(n.guestCode('+233244123456', null, '123456')).resolves.toEqual([]);
    sendSms.mockResolvedValue(true);
    sendEmail.mockResolvedValue(false);
    await expect(n.guestCode('+233244123456', 'kofi@example.com', '1')).resolves.toEqual(['024 ••• ••56']);
  });
});

describe('rental messages', () => {
  const hours = { pickupFrom: 8, returnBy: 18 };

  it('words pickup and payment as in the prototype', () => {
    expect(n.rentalNote(order(), hours)).toBe(
      'Reference AWR-NYMZ. Collect from No. 1 Wisepak Lane, New Asofan, from 8am on Sat 8 May, and bring everything back by 6pm on Mon 10 May. Pay GHS 1,150 at the desk when you collect: cash, MoMo or card.',
    );
    expect(n.rentalNote(order({ payMode: 'online' }), { pickupFrom: 0, returnBy: 12 })).toContain(
      "from 12am on Sat 8 May, and bring everything back by 12pm on Mon 10 May. You're fully paid, so just show your reference.",
    );
  });

  it('texts the note and emails the itemised order', async () => {
    await n.rentalConfirmed(order(), contact, hours);
    expect(sendSms.mock.calls[0]![1]).toMatch(/^Hotel A-Wise: Reference AWR-NYMZ\./);
    const text = sendEmail.mock.calls[0]![2] as string;
    expect(text).toContain('Canopy × 2: GHS 1,000');
    expect(text).toContain('Pack discount: −GHS 50');
    expect(text).toContain('Your order: https://hotelawise.com/rent/confirmation/otok');
    await n.rentalConfirmed(order({ email: null, discount: 0 }), contact, hours);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('texts a late rental refund', async () => {
    await n.rentalLateRefund(order(), 115000, contact);
    expect(sendSms.mock.calls[0]![1]).toContain('your payment of GHS 1,150 for AWR-NYMZ arrived after the 15-minute hold ended');
  });
});

describe('reminders and rental updates', () => {
  const hours = { pickupFrom: 8, returnBy: 18 };

  it('reminds the day before check-in, with any balance and the links', async () => {
    expect(await n.checkInReminder(booking(), contact, '14:00')).toBe(true);
    const sms = sendSms.mock.calls[0]![1] as string;
    expect(sms).toContain('see you tomorrow, Kofi. Executive Plus Room, ref AW-7KQ2. Check-in from 14:00');
    expect(sms).toContain('GHS 480 is due at the desk');
    expect(sendEmail.mock.calls[0]![2]).toContain('https://hotelawise.com/manage?ref=AW-7KQ2');
    sendSms.mockClear();
    await n.checkInReminder(booking({ paid: 68000, email: null }), contact, '14:00');
    expect(sendSms.mock.calls[0]![1]).not.toContain('due at the desk');
  });

  it('reports false when nothing could be sent, so the job tries again', async () => {
    sendSms.mockResolvedValue(false);
    expect(await n.checkInReminder(booking({ email: null }), contact, '14:00')).toBe(false);
    sendEmail.mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await n.pickupReminder(order(), contact, hours)).toBe(false);
    expect(await n.returnReminder(order(), contact, hours)).toBe(false);
  });

  it('reminds about pickup, with the 10am payment rule for pay-at-pickup', async () => {
    await n.pickupReminder(order(), contact, hours);
    expect(sendSms.mock.calls[0]![1]).toContain('ready to collect tomorrow from 8am');
    expect(sendSms.mock.calls[0]![1]).toContain('Pay GHS 1,150 when you collect, by 10am');
    sendSms.mockClear();
    await n.pickupReminder(order({ paid: 115000, email: null }), contact, hours);
    expect(sendSms.mock.calls[0]![1]).toContain('Just show your reference');
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('reminds about the return and the deposit', async () => {
    await n.returnReminder(order({ email: null }), contact, hours);
    expect(sendSms.mock.calls[0]![1]).toContain('bring rental AWR-NYMZ back tomorrow by 6pm');
    expect(sendSms.mock.calls[0]![1]).toContain('GHS 200 deposit');
    expect(sendEmail).not.toHaveBeenCalled();
    await n.returnReminder(order(), contact, hours);
    expect(sendEmail.mock.calls[0]![1]).toBe('Return tomorrow: AWR-NYMZ');
  });

  it('tells the customer an unpaid order was released', async () => {
    await n.orderReleased(order(), contact);
    await n.orderReleased(order({ email: null }), contact);
    expect(sendSms.mock.calls[0]![1]).toContain("wasn't collected and paid by 10am");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('sends a message for each forward status', async () => {
    await n.rentalStatusChanged(order(), 'ready_for_pickup', contact, hours);
    await n.rentalStatusChanged(order(), 'collected', contact, hours);
    await n.rentalStatusChanged(order({ email: null }), 'completed', contact, hours, 15000);
    await n.rentalStatusChanged(order({ email: null }), 'completed', contact, hours);
    const texts = sendSms.mock.calls.map((c) => c[1] as string);
    expect(texts[0]).toContain('is ready. Collect from No. 1 Wisepak Lane from 8am on');
    expect(texts[1]).toContain('Please bring rental AWR-NYMZ back by 6pm on');
    expect(texts[2]).toContain('GHS 150 of your deposit is on its way back');
    expect(texts[3]).not.toContain('deposit');
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });
});
