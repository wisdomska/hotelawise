// Paystack webhook. The only path that confirms online payments on its own:
// 1. check the HMAC signature, 2. store the event once (idempotency),
// 3. re-verify the transaction with Paystack, 4. settle it in one transaction.
import { eq, sql } from 'drizzle-orm';
import * as s from '@/server/db/schema';
import { validSignature } from '@/server/integrations/paystack';
import { withTransactionDb } from '@/server/platform/db';
import { checkAndSettle } from '@/server/services/payment-flow';

type Event = { event?: string; data?: { id?: number | string; reference?: string; status?: string; transaction_reference?: string } };

export async function POST(req: Request) {
  const raw = await req.text();
  const signatureOk = await validSignature(raw, req.headers.get('x-paystack-signature'));
  if (!signatureOk) return new Response('bad signature', { status: 401 });
  let evt: Event;
  try {
    evt = JSON.parse(raw) as Event;
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const type = evt.event ?? 'unknown';
  const key = `${type}:${evt.data?.reference ?? ''}:${evt.data?.id ?? ''}`;

  return withTransactionDb(async (db) => {
    const inserted = await db
      .insert(s.paystackEvents)
      .values({ eventKey: key, type, payload: evt as never, signatureOk })
      .onConflictDoNothing()
      .returning({ id: s.paystackEvents.id });
    if (!inserted.length) return new Response('duplicate', { status: 200 });
    const eventId = inserted[0]!.id;
    try {
      if (type === 'charge.success' && evt.data?.reference) {
        await checkAndSettle(db, evt.data.reference);
      } else if (type.startsWith('refund.') && evt.data?.id) {
        const status = type === 'refund.processed' ? 'refunded' : type === 'refund.failed' ? 'failed' : null;
        if (status)
          await db
            .update(s.refunds)
            .set({ status })
            .where(eq(s.refunds.paystackRefundId, String(evt.data.id)));
      }
      await db
        .update(s.paystackEvents)
        .set({ processedAt: sql`now()` })
        .where(eq(s.paystackEvents.id, eventId));
      return new Response('ok', { status: 200 });
    } catch (err) {
      await db
        .update(s.paystackEvents)
        .set({ error: String(err instanceof Error ? err.message : err).slice(0, 500) })
        .where(eq(s.paystackEvents.id, eventId));
      // Paystack retries non-2xx deliveries; allow the retry to process it again.
      await db.delete(s.paystackEvents).where(eq(s.paystackEvents.id, eventId));
      console.error('paystack webhook failed', err);
      return new Response('error', { status: 500 });
    }
  });
}
