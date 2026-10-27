// Staff downloads of a booking's or rental order's invoice, by reference.
import 'server-only';
import { ForbiddenError, type Capability } from '@/server/auth/permissions';
import { requirePermission } from '@/server/auth/session';
import { getSiteData } from '@/server/content/site-data';
import { db } from '@/server/platform/db';
import { bookingInvoice, invoiceTitle, orderInvoice, pdfResponse, renderInvoice } from '@/server/services/invoices';

export async function staffInvoice(kind: 'booking' | 'rental', ref: string): Promise<Response> {
  const need: Capability = kind === 'booking' ? 'bookings.view' : 'rentals.view';
  try {
    await requirePermission(need);
  } catch (e) {
    if (e instanceof ForbiddenError || (e instanceof Error && e.name === 'SetupRequiredError'))
      return new Response('Not allowed', { status: 403 });
    throw e;
  }
  const ok = kind === 'booking' ? /^AW-[A-Z0-9]{3,8}$/.test(ref) : /^AWR-[A-Z0-9]{3,8}$/.test(ref);
  if (!ok) return new Response('Not found', { status: 404 });
  const d = await db();
  const inv = kind === 'booking' ? await bookingInvoice(d, { ref }) : await orderInvoice(d, { ref });
  if (!inv) return new Response('Not found', { status: 404 });
  return pdfResponse(renderInvoice(inv, await getSiteData()), `hotelawise-${invoiceTitle(inv).toLowerCase()}-${inv.ref}.pdf`);
}
