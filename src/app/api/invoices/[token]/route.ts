// A guest's invoice or receipt as a PDF, for a booking or a rental order, by
// the unguessable token on their confirmation page.
import { getSiteData } from '@/server/content/site-data';
import { db } from '@/server/platform/db';
import { bookingInvoice, invoiceTitle, orderInvoice, pdfResponse, renderInvoice } from '@/server/services/invoices';

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!process.env.DATABASE_URL || !/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new Response('Not found', { status: 404 });
  const d = await db();
  const inv = (await bookingInvoice(d, { token })) ?? (await orderInvoice(d, { token }));
  if (!inv) return new Response('Not found', { status: 404 });
  return pdfResponse(renderInvoice(inv, await getSiteData()), `hotelawise-${invoiceTitle(inv).toLowerCase()}-${inv.ref}.pdf`);
}
