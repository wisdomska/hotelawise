'use server';
// Reports › Export: the CSV for the open tab, logged in the audit trail.
import { z } from 'zod';
import { done } from '@/lib/admin/result';
import { todayInAccra } from '@/lib/dates';
import { act } from '@/server/admin/act';
import { reportCsv, toCsv } from '@/server/admin/reports';
import { audit } from '@/server/services/audit';

export async function exportReportAction(tab: string) {
  const t = z.enum(['Rooms', 'Rentals', 'Staff']).parse(tab);
  return act('exports.download', async (tx, who) => {
    const today = todayInAccra();
    const rows = await reportCsv(tx, t, today);
    await audit(tx, { actor: who, action: 'Exported CSV', entity: 'report', target: `Reports › ${t}`, after: { rows: rows.length - 1 } });
    return done('Download started.', `${rows.length - 1} rows`, { csv: toCsv(rows), name: `awise-${t.toLowerCase()}-${today}.csv` });
  });
}
