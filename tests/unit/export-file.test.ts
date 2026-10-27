import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/server/auth/session', () => ({ requirePermission: vi.fn() }));
vi.mock('@/server/platform/db', () => ({ db: vi.fn() }));
vi.mock('@/server/services/audit', () => ({ audit: vi.fn() }));

const { exportFile, exportFormat, toCsv } = await import('@/server/admin/csv-response');

describe('admin exports', () => {
  it('reads the format from the request', () => {
    expect(exportFormat(new Request('https://x/admin/bookings/export?format=xlsx'))).toBe('xlsx');
    expect(exportFormat(new Request('https://x/admin/payments/export?f=all'))).toBe('csv');
  });

  it('writes CSV with a BOM and guarded formulas', () => {
    const f = exportFile(
      [
        ['Ref', 'Total'],
        ['=1+1', '12.00'],
      ],
      'csv',
      'bookings-2026-10-26',
      'Bookings',
    );
    expect(f).toMatchObject({ type: 'text/csv; charset=utf-8', name: 'bookings-2026-10-26.csv' });
    expect(f.body).toBe("﻿Ref,Total\r\n'=1+1,12.00\r\n");
    expect(toCsv([['a,b']])).toBe('"a,b"\r\n');
  });

  it('writes Excel with amounts as numbers and codes kept as text', () => {
    const f = exportFile(
      [
        ['Ref', 'Total', 'Phone', 'Code'],
        ['AW-1', '12.50', '+233244123456', '0244'],
      ],
      'xlsx',
      'bookings',
      'Bookings',
    );
    expect(f.name).toBe('bookings.xlsx');
    expect(f.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const text = new TextDecoder().decode(f.body as Uint8Array);
    expect(text).toContain('<c r="B2"><v>12.5</v></c>');
    expect(text).toContain('<c r="D2" t="inlineStr"><is><t xml:space="preserve">0244</t></is></c>');
    expect(text).toContain('+233244123456');
  });
});
