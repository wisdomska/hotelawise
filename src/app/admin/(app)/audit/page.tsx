import { AuditScreen } from '@/components/admin/users/screens';
import { auditFilters, auditPage } from '@/server/admin/users';
import { can } from '@/server/auth/permissions';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Audit log' };

type Search = { who?: string; what?: string; from?: string; to?: string; p?: string };

export default async function AuditPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePage('audit.view');
  const sp = await searchParams;
  const filters = auditFilters(sp);
  const page = Math.max(0, (Number.parseInt(sp.p ?? '1', 10) || 1) - 1);
  const data = await auditPage(await db(), filters, page);
  return <AuditScreen {...data} page={page} filters={filters} canExport={can(actor, 'exports.download')} />;
}
