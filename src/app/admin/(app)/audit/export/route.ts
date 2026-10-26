// The audit log as CSV or Excel, with the same filters as the screen.
import { todayInAccra } from '@/lib/dates';
import { csvDownload } from '@/server/admin/csv-response';
import { auditExport, auditFilters } from '@/server/admin/users';

export async function GET(req: Request) {
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  return csvDownload(req, ['audit.view', 'exports.download'], 'Audit log', `awise-audit-${todayInAccra()}`, async (d) => [
    ['when', 'who', 'action', 'what', 'target', 'change'],
    ...(await auditExport(d, auditFilters(sp))).map((a) => [a.at, a.who, a.action, a.entity, a.target, a.change]),
  ]);
}
