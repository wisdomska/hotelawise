// CSV downloads for admin exports: permission check, an audit row, and cells
// guarded against spreadsheet formula injection (a leading = + - @ is quoted).
import 'server-only';
import { ForbiddenError, type Capability } from '@/server/auth/permissions';
import { requirePermission } from '@/server/auth/session';
import { db } from '@/server/platform/db';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export async function csvDownload(
  needs: Capability[],
  what: string,
  filename: string,
  build: (d: AnyDb) => Promise<(string | number | null | undefined)[][]>,
): Promise<Response> {
  try {
    let actor = await requirePermission(needs[0]!);
    for (const c of needs.slice(1)) actor = await requirePermission(c);
    const d = await db();
    const rows = await build(d);
    await audit(d, {
      actor: { id: actor.id, name: actor.name },
      action: 'Exported CSV',
      entity: 'export',
      target: what,
      after: { rows: rows.length - 1 },
    });
    return new Response('﻿' + toCsv(rows), {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError || (e instanceof Error && e.name === 'SetupRequiredError'))
      return new Response('Not allowed', { status: 403 });
    console.error('csv export failed', e);
    return new Response('Export failed', { status: 500 });
  }
}
