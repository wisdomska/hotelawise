// Customers › Newsletter › Export: active subscribers as CSV or Excel.
import { todayInAccra } from '@/lib/dates';
import { allSubscribers } from '@/server/admin/customers';
import { csvDownload } from '@/server/admin/csv-response';

export async function GET(req: Request) {
  return csvDownload(
    req,
    ['customers.view', 'exports.download'],
    'Newsletter subscribers',
    `hotel-a-wise-newsletter-${todayInAccra()}`,
    async (d) => [
      ['email', 'signed_up', 'source'],
      ...(await allSubscribers(d)).map((x) => [x.email, x.at.toISOString().slice(0, 10), x.source]),
    ],
  );
}
