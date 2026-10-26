// Customers › Newsletter › Export: active subscribers as CSV.
import { todayInAccra } from '@/lib/dates';
import { allSubscribers } from '@/server/admin/customers';
import { csvDownload } from '@/server/admin/csv-response';

export async function GET() {
  return csvDownload(
    ['customers.view', 'exports.download'],
    'Newsletter subscribers',
    `hotel-a-wise-newsletter-${todayInAccra()}.csv`,
    async (d) => [
      ['email', 'signed_up', 'source'],
      ...(await allSubscribers(d)).map((x) => [x.email, x.at.toISOString().slice(0, 10), x.source]),
    ],
  );
}
