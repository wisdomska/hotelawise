// Payments › Export: successful payments as CSV, for the filter on screen.
import { todayInAccra } from '@/lib/dates';
import { csvDownload } from '@/server/admin/csv-response';
import { allTransactions, TX_FILTERS, type TxFilter } from '@/server/admin/payments';

export async function GET(req: Request) {
  const f = new URL(req.url).searchParams.get('f') ?? 'all';
  const filter: TxFilter = (TX_FILTERS as readonly string[]).includes(f) ? (f as TxFilter) : 'all';
  return csvDownload(
    ['payments.view', 'exports.download'],
    `Payments (${filter})`,
    `hotel-a-wise-payments-${todayInAccra()}.csv`,
    async (d) => [
      ['date', 'for', 'customer', 'method', 'channel', 'amount_ghs'],
      ...(await allTransactions(d, filter)).map((t) => [t.day, t.ref, t.who, t.method, t.channel, (t.amount / 100).toFixed(2)]),
    ],
  );
}
