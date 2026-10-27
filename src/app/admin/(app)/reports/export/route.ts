// Reports › Export: the rows behind the open tab, as CSV or Excel.
import { todayInAccra } from '@/lib/dates';
import { csvDownload } from '@/server/admin/csv-response';
import { reportCsv } from '@/server/admin/reports';

const TABS = ['Rooms', 'Rentals', 'Staff'] as const;

export async function GET(req: Request) {
  const tab = new URL(req.url).searchParams.get('tab');
  const t = TABS.find((x) => x === tab) ?? 'Rooms';
  const today = todayInAccra();
  return csvDownload(req, ['reports.view', 'exports.download'], `Reports › ${t}`, `awise-${t.toLowerCase()}-${today}`, (d) =>
    reportCsv(d, t, today),
  );
}
