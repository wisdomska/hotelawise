// The audit log as CSV, with the same filters as the screen.
import { todayInAccra } from '@/lib/dates';
import { auditExport, auditFilters, toCsv } from '@/server/admin/users';
import { can, ForbiddenError } from '@/server/auth/permissions';
import { requirePermission } from '@/server/auth/session';
import { db } from '@/server/platform/db';
import { audit } from '@/server/services/audit';

export async function GET(request: Request) {
  let actor;
  try {
    actor = await requirePermission('audit.view');
  } catch {
    return new Response('Not allowed', { status: 403 });
  }
  if (!can(actor, 'exports.download')) return new Response(new ForbiddenError('exports.download').message, { status: 403 });
  const sp = Object.fromEntries(new URL(request.url).searchParams);
  const d = await db();
  const rows = await auditExport(d, auditFilters(sp));
  await audit(d, {
    actor: { id: actor.id, name: actor.name },
    action: 'Exported CSV',
    entity: 'audit',
    target: 'Audit log',
    after: { rows: rows.length },
  });
  const csv = toCsv([
    ['when', 'who', 'action', 'what', 'target', 'change'],
    ...rows.map((a) => [a.at, a.who, a.action, a.entity, a.target, a.change]),
  ]);
  return new Response('﻿' + csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="awise-audit-${todayInAccra()}.csv"`,
      'cache-control': 'no-store',
    },
  });
}
