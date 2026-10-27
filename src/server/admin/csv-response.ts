// Admin exports as CSV or Excel: permission check, an audit row, and CSV cells
// guarded against spreadsheet formula injection (a leading = + - @ is quoted;
// Excel text cells are inline strings, which never run as formulas).
import 'server-only';
import { xlsx, XLSX_TYPE } from '@/lib/xlsx';
import { ForbiddenError, type Capability } from '@/server/auth/permissions';
import { requirePermission } from '@/server/auth/session';
import { db } from '@/server/platform/db';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';

type Cell = string | number | null | undefined;
export type ExportFormat = 'csv' | 'xlsx';

export function toCsv(rows: Cell[][]): string {
  const cell = (v: Cell) => {
    let t = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
    return /[",\n\r]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  return rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** ?format=xlsx asks for Excel; anything else is CSV. */
export function exportFormat(req: Request): ExportFormat {
  return new URL(req.url).searchParams.get('format') === 'xlsx' ? 'xlsx' : 'csv';
}

/** Amounts like "1234.50" become numbers in Excel; codes with a leading zero stay text. */
function forSheet(rows: Cell[][]): Cell[][] {
  return rows.map((r, i) =>
    i === 0 ? r : r.map((v) => (typeof v === 'string' && /^-?(0|[1-9]\d{0,14})(\.\d+)?$/.test(v) ? Number(v) : v)),
  );
}

/** The file to send back, as CSV or a one-sheet workbook. */
export function exportFile(
  rows: Cell[][],
  format: ExportFormat,
  base: string,
  sheet: string,
): { body: BodyInit; type: string; name: string } {
  if (format === 'xlsx') return { body: xlsx(forSheet(rows), sheet) as BodyInit, type: XLSX_TYPE, name: `${base}.xlsx` };
  return { body: '﻿' + toCsv(rows), type: 'text/csv; charset=utf-8', name: `${base}.csv` };
}

/**
 * An export download. `base` is the file name without its extension; the
 * request's ?format= picks CSV or Excel.
 */
export async function csvDownload(
  req: Request,
  needs: Capability[],
  what: string,
  base: string,
  build: (d: AnyDb) => Promise<Cell[][]>,
): Promise<Response> {
  const format = exportFormat(req);
  try {
    let actor = await requirePermission(needs[0]!);
    for (const c of needs.slice(1)) actor = await requirePermission(c);
    const d = await db();
    const rows = await build(d);
    await audit(d, {
      actor: { id: actor.id, name: actor.name },
      action: format === 'xlsx' ? 'Exported spreadsheet' : 'Exported CSV',
      entity: 'export',
      target: what,
      after: { rows: rows.length - 1 },
    });
    const f = exportFile(rows, format, base, what);
    return new Response(f.body, {
      headers: {
        'content-type': f.type,
        'content-disposition': `attachment; filename="${f.name}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e) {
    if (e instanceof ForbiddenError || (e instanceof Error && e.name === 'SetupRequiredError'))
      return new Response('Not allowed', { status: 403 });
    console.error('export failed', e);
    return new Response('Export failed', { status: 500 });
  }
}
