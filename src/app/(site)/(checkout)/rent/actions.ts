'use server';
// Rentals: live stock for the chosen dates and the order itself (reserve &
// collect). Prices, pack discounts and stock are all checked on the server.
import { z } from 'zod';
import { checkMomo, type PayMethod } from '@/lib/booking-form';
import { isIsoDate, nightsBetween, todayInAccra } from '@/lib/dates';
import { checkCollector, type CollectorErrors } from '@/lib/rental-form';
import { contactFrom } from '@/server/content/contact';
import { getSiteData } from '@/server/content/site-data';
import {
  chargeMomo,
  failureReason,
  initializeCard,
  MOMO_PROVIDER,
  PaystackError,
  paystackConfigured,
} from '@/server/integrations/paystack';
import { verifyTurnstile } from '@/server/integrations/turnstile';
import { db, withTransactionDb } from '@/server/platform/db';
import { env } from '@/server/platform/env';
import { allow } from '@/server/platform/rate-limit';
import { clientIp } from '@/server/platform/request';
import { createPendingPayment, newToken } from '@/server/services/bookings';
import { contactAndTemplate, checkAndSettle } from '@/server/services/payment-flow';
import { rentalConfirmed } from '@/server/services/notify';
import { NotEnoughStockError, orderBy, placeRentalOrder, stockForRange } from '@/server/services/rentals';

const ready = () => !!process.env.DATABASE_URL;
const MAX_DAYS = 30;

function validRange(from: string, to: string) {
  return isIsoDate(from) && isIsoDate(to) && to >= from && from >= todayInAccra() && nightsBetween(from, to) < MAX_DAYS;
}

export type StockView = { ok: true; stock: Record<string, number> } | { ok: false; error: string };

export async function rentalStock(from: string, to: string): Promise<StockView> {
  if (!validRange(from, to)) return { ok: false, error: 'Pick an end date on or after the start date.' };
  if (!(await allow('availability', await clientIp()))) return { ok: false, error: 'Too many checks. Give it a minute.' };
  if (!ready()) {
    const { RENTAL_ITEMS } = await import('@/server/content/catalogue');
    return { ok: true, stock: Object.fromEntries(RENTAL_ITEMS.map((i) => [i.slug, i.stock])) };
  }
  return { ok: true, stock: await stockForRange(await db(), from, to, new Date()) };
}

export type OrderStart =
  | { ok: true; kind: 'confirmed'; href: string }
  | { ok: true; kind: 'momo'; payRef: string; stage: 'prompt' | 'otp'; display: string; orderToken?: string }
  | { ok: true; kind: 'card'; payRef: string; accessCode: string; orderToken?: string }
  | {
      ok: false;
      error: string;
      errors?: CollectorErrors;
      field?: 'momo';
      failed?: boolean;
      shortages?: Record<string, number>;
      orderToken?: string;
    };

const schema = z.object({
  from: z.string(),
  to: z.string(),
  cart: z.record(z.string().max(40), z.number().int().min(0).max(5000)),
  packs: z.array(z.string().max(80)).max(10),
  collector: z.object({ name: z.string(), phone: z.string(), email: z.string(), occasion: z.string() }),
  plan: z.enum(['online', 'at_pickup']),
  method: z.enum(['mtn', 'telecel', 'airteltigo', 'card']),
  momo: z.string().max(32),
  turnstile: z.string().nullable(),
});

export async function placeOrder(raw: z.input<typeof schema>): Promise<OrderStart> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'Something on the form needs another look.' };
  const input = parsed.data;
  if (!validRange(input.from, input.to)) return { ok: false, error: 'Those dates have passed. Pick new ones.' };
  if (!Object.values(input.cart).some((q) => q > 0)) return { ok: false, error: 'Add at least one item.' };
  const c = checkCollector(input.collector);
  if (!c.ok) return { ok: false, error: 'Check the highlighted details.', errors: c.errors };
  const online = input.plan === 'online';
  const isMomo = input.method !== 'card';
  const momo = online && isMomo ? checkMomo(input.momo) : null;
  if (momo && !momo.ok) return { ok: false, field: 'momo', error: momo.error };
  const ip = await clientIp();
  if (!(await allow('payment', ip))) return { ok: false, error: 'Too many tries. Give it a few minutes, or call us.' };
  const deskPhone = contactFrom(await getSiteData()).phone;
  if (!ready()) return { ok: false, error: `Online reservations open soon. Call ${deskPhone} and the desk will set the items aside.` };
  if (online && !paystackConfigured())
    return { ok: false, error: `Online payment isn't switched on yet. Choose “Pay when you collect”, or call ${deskPhone}.` };
  if (!(await verifyTurnstile(input.turnstile, ip)))
    return { ok: false, error: 'We couldn’t confirm you’re not a bot. Refresh and try again.' };

  try {
    const order = await withTransactionDb((tx) =>
      placeRentalOrder(tx, {
        starts: input.from,
        ends: input.to,
        cart: input.cart,
        packs: input.packs,
        collector: { name: c.value.name, phoneE164: c.value.phoneE164, email: c.value.email },
        occasion: c.value.occasion,
        payMode: input.plan,
        publicToken: newToken(),
        refSecret: env().REF_SECRET,
      }),
    );
    if (!online) {
      const view = await orderBy(await db(), { id: order.id });
      if (view) {
        const { contact, hours } = await contactAndTemplate();
        await rentalConfirmed(view, contact, hours);
      }
      return { ok: true, kind: 'confirmed', href: `/rent/confirmation/${order.publicToken}` };
    }
    const payRef = await withTransactionDb((tx) =>
      createPendingPayment(tx, { orderId: order.id, amount: order.totalPesewas, method: input.method as PayMethod }),
    );
    const email = c.value.email ?? `guest-${order.ref.toLowerCase()}@hotelawise.com`;
    const metadata = { order_ref: order.ref, order_token: order.publicToken, kind: 'rental' };
    if (isMomo) {
      const ch = await chargeMomo({
        email,
        amount: order.totalPesewas,
        reference: payRef,
        phone: momo!.ok ? momo!.e164.replace('+233', '0') : '',
        provider: MOMO_PROVIDER[input.method as 'mtn' | 'telecel' | 'airteltigo'],
        metadata,
      });
      if (ch.status === 'failed')
        return { ok: false, failed: true, orderToken: order.publicToken, error: failureReason(ch.gateway_response ?? ch.message, 'momo') };
      if (ch.status === 'success') {
        await withTransactionDb((tx) => checkAndSettle(tx, payRef));
        return { ok: true, kind: 'confirmed', href: `/rent/confirmation/${order.publicToken}` };
      }
      return {
        ok: true,
        kind: 'momo',
        payRef,
        stage: ch.status === 'send_otp' ? 'otp' : 'prompt',
        display: ch.display_text || `We've sent a prompt to ${input.momo}. Enter your MoMo PIN to approve.`,
        orderToken: order.publicToken,
      };
    }
    const init = await initializeCard({
      email,
      amount: order.totalPesewas,
      reference: payRef,
      callbackUrl: `${env().APP_URL}/rent/confirmation/${order.publicToken}`,
      metadata,
    });
    return { ok: true, kind: 'card', payRef, accessCode: init.access_code, orderToken: order.publicToken };
  } catch (e) {
    if (e instanceof NotEnoughStockError) {
      const all = await stockForRange(await db(), input.from, input.to, new Date());
      return { ok: false, error: 'Some items went while you were choosing. We’ve updated the quantities.', shortages: all };
    }
    if (e instanceof PaystackError)
      return {
        ok: false,
        failed: true,
        error: 'Paystack couldn’t start the payment. Nothing was taken. Try again, or use a card instead.',
      };
    if (e instanceof RangeError) return { ok: false, error: e.message };
    throw e;
  }
}

/** "Try again" after a failed payment: a new attempt on the same order, while its hold lasts. */
export async function payForOrder(input: { token: string; method: PayMethod; momo: string }): Promise<OrderStart> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(input.token) || !['mtn', 'telecel', 'airteltigo', 'card'].includes(input.method)) {
    return { ok: false, error: 'Something on the form needs another look.' };
  }
  const isMomo = input.method !== 'card';
  const momo = isMomo ? checkMomo(input.momo) : null;
  if (momo && !momo.ok) return { ok: false, field: 'momo', error: momo.error };
  if (!(await allow('payment', await clientIp()))) return { ok: false, error: 'Too many tries. Give it a few minutes, or call us.' };
  if (!ready() || !paystackConfigured()) return { ok: false, error: 'Online payment isn’t available right now.' };
  const d = await db();
  const o = await orderBy(d, { token: input.token });
  const { rentalOrders } = await import('@/server/db/schema');
  const { eq } = await import('drizzle-orm');
  const [row] = o ? await d.select({ holdUntil: rentalOrders.holdUntil }).from(rentalOrders).where(eq(rentalOrders.id, o.id)) : [];
  if (!o || o.status !== 'pending_payment' || !row?.holdUntil || row.holdUntil <= new Date()) {
    return { ok: false, error: 'Your 15-minute hold ran out. Start the order again and we’ll check the stock.' };
  }
  try {
    const payRef = await withTransactionDb((tx) => createPendingPayment(tx, { orderId: o.id, amount: o.total, method: input.method }));
    const email = o.email ?? `guest-${o.ref.toLowerCase()}@hotelawise.com`;
    const metadata = { order_ref: o.ref, order_token: o.token, kind: 'rental' };
    if (isMomo) {
      const ch = await chargeMomo({
        email,
        amount: o.total,
        reference: payRef,
        phone: momo!.ok ? momo!.e164.replace('+233', '0') : '',
        provider: MOMO_PROVIDER[input.method as 'mtn' | 'telecel' | 'airteltigo'],
        metadata,
      });
      if (ch.status === 'failed') return { ok: false, failed: true, error: failureReason(ch.gateway_response ?? ch.message, 'momo') };
      return {
        ok: true,
        kind: 'momo',
        payRef,
        stage: ch.status === 'send_otp' ? 'otp' : 'prompt',
        display: ch.display_text || `We've sent a prompt to ${input.momo}. Enter your MoMo PIN to approve.`,
      };
    }
    const init = await initializeCard({
      email,
      amount: o.total,
      reference: payRef,
      callbackUrl: `${env().APP_URL}/rent/confirmation/${o.token}`,
      metadata,
    });
    return { ok: true, kind: 'card', payRef, accessCode: init.access_code };
  } catch (e) {
    if (e instanceof PaystackError)
      return {
        ok: false,
        failed: true,
        error: 'Paystack couldn’t start the payment. Nothing was taken. Try again, or use a card instead.',
      };
    throw e;
  }
}
