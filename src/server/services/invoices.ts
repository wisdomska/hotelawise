// Invoices and receipts as PDFs, for a room booking or a rental order. A fully
// paid booking or order prints as a receipt; anything with a balance prints as
// an invoice. Guests reach theirs by the confirmation token, staff by reference.
import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { METHOD, type Method } from '@/lib/admin/labels';
import { addDays, formatShortDate, todayInAccra, type IsoDate } from '@/lib/dates';
import { A4, PdfDoc, wrap, type PdfPage } from '@/lib/pdf';
import { formatPhone } from '@/lib/phone';
import { contactFrom } from '@/server/content/contact';
import { setting, type SiteData } from '@/server/content/site-data';
import * as s from '@/server/db/schema';
import { bookingBy } from './bookings';
import type { AnyDb } from './holds';
import { orderBy } from './rentals';

export type InvoiceLine = { label: string; amount: number; note?: string };
export type InvoicePayment = { at: Date | null; method: string; amount: number };

export type InvoiceData = {
  kind: 'booking' | 'rental';
  ref: string;
  status: string;
  billTo: { name: string; phone: string; email: string | null };
  details: [string, string][];
  lines: InvoiceLine[];
  /** Discounts and other adjustments printed under the lines, as negative amounts. */
  adjustments: InvoiceLine[];
  total: number;
  paid: number;
  refunded: number;
  payments: InvoicePayment[];
  note?: string;
};

const LIVE_REFUNDS = ['processing', 'refunded', 'manual_refunded'] as const;

async function money(db: AnyDb, target: { bookingId: string } | { orderId: string }) {
  const where = 'bookingId' in target ? eq(s.payments.bookingId, target.bookingId) : eq(s.payments.orderId, target.orderId);
  const pays = await db
    .select({
      id: s.payments.id,
      at: s.payments.paidAt,
      created: s.payments.createdAt,
      method: s.payments.method,
      channel: s.payments.channel,
      amount: s.payments.amountPesewas,
    })
    .from(s.payments)
    .where(and(where, eq(s.payments.status, 'success')))
    .orderBy(asc(s.payments.createdAt));
  const refunds = pays.length
    ? await db
        .select({ amount: s.refunds.amountPesewas })
        .from(s.refunds)
        .where(
          and(
            inArray(
              s.refunds.paymentId,
              pays.map((p) => p.id),
            ),
            inArray(s.refunds.status, [...LIVE_REFUNDS]),
          ),
        )
    : [];
  return {
    payments: pays.map((p) => ({
      at: p.at ?? p.created,
      method: p.method ? METHOD[p.method as Method] : p.channel === 'paystack' ? 'Paystack' : 'Desk',
      amount: p.amount,
    })),
    refunded: refunds.reduce((t, r) => t + r.amount, 0),
  };
}

const BOOKING_STATUS: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  confirmed: 'Confirmed',
  checked_in: 'Checked in',
  checked_out: 'Checked out',
  cancelled: 'Cancelled',
  no_show: 'No-show',
};
const ORDER_STATUS: Record<string, string> = {
  pending_payment: 'Awaiting payment',
  reserved: 'Reserved',
  ready_for_pickup: 'Ready for pickup',
  collected: 'Collected',
  returned: 'Returned',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** A booking's invoice data, or null when there's nothing to bill (unknown, a hold, or expired). */
export async function bookingInvoice(db: AnyDb, where: { token: string } | { ref: string }): Promise<InvoiceData | null> {
  const b = await bookingBy(db, where);
  if (!b?.ref || !BOOKING_STATUS[b.status]) return null;
  const [room] = await db
    .select({ number: s.rooms.number })
    .from(s.bookings)
    .innerJoin(s.rooms, eq(s.rooms.id, s.bookings.roomId))
    .where(eq(s.bookings.id, b.id));
  const m = await money(db, { bookingId: b.id });
  return {
    kind: 'booking',
    ref: b.ref,
    status: BOOKING_STATUS[b.status]!,
    billTo: { name: b.guestName || 'Guest', phone: b.phone, email: b.email },
    details: [
      ['Room', `${b.variantName}${room ? ` · Room ${room.number}` : ''}`],
      ['Check-in', formatShortDate(b.checkIn)],
      ['Check-out', formatShortDate(b.checkOut)],
      ['Stay', `${b.nights} night${b.nights === 1 ? '' : 's'} · ${b.guests} guest${b.guests === 1 ? '' : 's'}`],
    ],
    lines: b.lines,
    adjustments: b.discount ? [{ label: `Promo ${b.promoCode ?? ''}`.trim(), amount: -b.discount }] : [],
    total: b.total,
    paid: b.paid,
    refunded: m.refunded,
    payments: m.payments,
  };
}

/** A rental order's invoice data, or null when it doesn't exist. */
export async function orderInvoice(db: AnyDb, where: { token: string } | { ref: string }): Promise<InvoiceData | null> {
  let o;
  if ('token' in where) o = await orderBy(db, { token: where.token });
  else {
    const [row] = await db.select({ id: s.rentalOrders.id }).from(s.rentalOrders).where(eq(s.rentalOrders.ref, where.ref));
    o = row ? await orderBy(db, { id: row.id }) : null;
  }
  if (!o) return null;
  const [m, [check]] = await Promise.all([
    money(db, { orderId: o.id }),
    db.select({ deduction: s.returnChecklists.deductionPesewas }).from(s.returnChecklists).where(eq(s.returnChecklists.orderId, o.id)),
  ]);
  const returnBy = addDays(o.ends, 1);
  return {
    kind: 'rental',
    ref: o.ref,
    status: ORDER_STATUS[o.status] ?? o.status,
    billTo: { name: o.collectorName, phone: o.phone, email: o.email },
    details: [
      ['Pickup', formatShortDate(o.starts)],
      ['Return by', formatShortDate(returnBy as IsoDate)],
      ['Hire', `${o.days} day${o.days === 1 ? '' : 's'}`],
      ...(o.occasion ? ([['Occasion', o.occasion]] as [string, string][]) : []),
    ],
    lines: [
      ...o.lines.map((l) => ({ label: `${l.name} × ${l.qty}`, amount: l.amount, note: `${o.days} day${o.days === 1 ? '' : 's'}` })),
      { label: 'Security deposit (refundable)', amount: o.deposit },
    ],
    adjustments: o.discount ? [{ label: 'Pack discount', amount: -o.discount }] : [],
    total: o.total,
    paid: o.paid,
    refunded: m.refunded,
    payments: m.payments,
    note: check?.deduction ? `Kept from the deposit on return (missing or damaged items): ${ghs(check.deduction)}.` : undefined,
  };
}

/* ───────────── the document ───────────── */

/** "GHS 1,234.00": invoices always show pesewas. */
export function ghs(p: number): string {
  const neg = p < 0;
  const abs = Math.abs(Math.round(p));
  const body = `${Math.floor(abs / 100).toLocaleString('en-GB')}.${String(abs % 100).padStart(2, '0')}`;
  return `${neg ? '- ' : ''}GHS ${body}`;
}

const NAVY = '#00003A';
const INK = '#1A1A2E';
const MUTE = '#6B6B80';
const RULE = '#D9D6CC';
const CREAM = '#F5F2EA';
const M = 48;
const R = A4.w - M;

export function taxNote(data: SiteData): string | null {
  if (!setting<boolean>(data, 'tax.included')) return null;
  const parts = [
    ['VAT', setting<number>(data, 'tax.vatPercent')],
    ['NHIL', setting<number>(data, 'tax.nhilPercent')],
    ['GETFund', setting<number>(data, 'tax.getfundPercent')],
    ['Tourism levy', setting<number>(data, 'tax.tourismPercent')],
  ].filter(([, v]) => Number(v) > 0) as [string, number][];
  if (!parts.length) return null;
  const list = parts.map(([k, v]) => `${k} ${v}%`);
  return `Prices include ${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0]}.`;
}

export function invoiceTitle(d: InvoiceData): 'Receipt' | 'Invoice' {
  return d.total > 0 && d.paid >= d.total ? 'Receipt' : 'Invoice';
}

/** Lays the invoice out on A4 and returns the PDF bytes. */
export function renderInvoice(d: InvoiceData, data: SiteData, issued: IsoDate = todayInAccra()): Uint8Array {
  const ct = contactFrom(data);
  const title = invoiceTitle(d);
  const doc = new PdfDoc({ title: `${title} ${d.ref}`, author: 'Hotel A-Wise' });
  let page = doc.addPage();
  let y = 0;

  const header = (p: PdfPage, first: boolean) => {
    p.rect(0, 0, A4.w, 6, { fill: NAVY });
    p.text(M, 58, 'Hotel A-Wise', { size: 22, bold: true, color: NAVY });
    p.text(M, 76, ct.address, { size: 9, color: MUTE });
    const phones = [ct.phone, ct.phone2].filter(Boolean).join(' · ');
    p.text(M, 89, `${phones}${phones ? ' · ' : ''}${ct.email}`, { size: 9, color: MUTE });
    p.text(R, 58, title.toUpperCase(), { size: 20, bold: true, color: NAVY, align: 'right' });
    p.text(R, 76, d.ref, { size: 11, bold: true, color: INK, align: 'right' });
    p.text(R, 89, first ? `Issued ${formatShortDate(issued)} ${issued.slice(0, 4)}` : 'Continued', {
      size: 9,
      color: MUTE,
      align: 'right',
    });
    p.line(M, 104, R, 104, { color: RULE, width: 0.75 });
  };
  const footer = (p: PdfPage, n: number) => {
    p.line(M, A4.h - 52, R, A4.h - 52, { color: RULE });
    p.text(M, A4.h - 38, `Hotel A-Wise · ${ct.address}`, { size: 8, color: MUTE });
    p.text(R, A4.h - 38, `${d.ref} · page ${n}`, { size: 8, color: MUTE, align: 'right' });
  };
  /** Starts a new page when the next block wouldn't fit above the footer. */
  const need = (h: number) => {
    if (y + h <= A4.h - 70) return;
    footer(page, doc.pages.length);
    page = doc.addPage();
    header(page, false);
    y = 130;
  };

  header(page, true);

  // Billed to, and the stay or hire details.
  y = 132;
  page.text(M, y, 'BILLED TO', { size: 8, bold: true, color: MUTE });
  page.text(330, y, d.kind === 'booking' ? 'STAY' : 'RENTAL', { size: 8, bold: true, color: MUTE });
  let ly = y + 16;
  page.text(M, ly, d.billTo.name, { size: 11, bold: true, color: INK });
  for (const line of [d.billTo.phone ? formatPhone(d.billTo.phone) : '', d.billTo.email ?? ''].filter(Boolean)) {
    ly += 14;
    page.text(M, ly, line, { size: 9.5, color: INK });
  }
  let ry = y + 16;
  for (const [k, v] of [...d.details, ['Status', d.status] as [string, string]]) {
    page.text(330, ry, k, { size: 9.5, color: MUTE });
    page.text(R, ry, v, { size: 9.5, color: INK, align: 'right' });
    ry += 14;
  }
  y = Math.max(ly, ry) + 22;

  // Lines.
  page.rect(M, y - 12, R - M, 20, { fill: CREAM });
  page.text(M + 8, y + 2, 'DESCRIPTION', { size: 8, bold: true, color: NAVY });
  page.text(R - 8, y + 2, 'AMOUNT', { size: 8, bold: true, color: NAVY, align: 'right' });
  y += 26;
  for (const l of d.lines) {
    const wrapped = wrap(l.label, 340, 10);
    need(wrapped.length * 13 + (l.note ? 12 : 0) + 8);
    wrapped.forEach((w, i) => page.text(M + 8, y + i * 13, w, { size: 10, color: INK }));
    page.text(R - 8, y, ghs(l.amount), { size: 10, color: INK, align: 'right' });
    y += wrapped.length * 13;
    if (l.note) {
      page.text(M + 8, y - 1, l.note, { size: 8.5, color: MUTE });
      y += 12;
    }
    page.line(M, y - 4, R, y - 4, { color: RULE, width: 0.4 });
    y += 10;
  }

  // Totals.
  const balance = Math.max(0, d.total - d.paid);
  const rows: [string, string, boolean][] = [
    ...d.adjustments.map((a) => [a.label, ghs(a.amount), false] as [string, string, boolean]),
    ['Total', ghs(d.total), true],
    ['Paid', ghs(d.paid), false],
    ...(d.refunded ? ([['Refunded', ghs(-d.refunded), false]] as [string, string, boolean][]) : []),
    [balance ? 'Balance due' : 'Balance', ghs(balance), true],
  ];
  need(rows.length * 18 + 20);
  y += 4;
  for (const [k, v, strong] of rows) {
    page.text(330, y, k, { size: strong ? 10.5 : 10, bold: strong, color: strong ? NAVY : MUTE });
    page.text(R - 8, y, v, { size: strong ? 10.5 : 10, bold: strong, color: strong ? NAVY : INK, align: 'right' });
    y += 18;
  }
  if (balance === 0 && d.total > 0) {
    page.rect(M, y - 50, 92, 26, { stroke: '#1F7A4D', width: 1.2 });
    page.text(M + 46, y - 33, 'PAID IN FULL', { size: 9.5, bold: true, color: '#1F7A4D', align: 'center' });
  }

  // Payments.
  if (d.payments.length) {
    y += 14;
    need(30 + d.payments.length * 15);
    page.text(M, y, 'PAYMENTS', { size: 8, bold: true, color: MUTE });
    y += 16;
    for (const p of d.payments) {
      const when = p.at ? formatShortDate(p.at.toISOString().slice(0, 10)) : '';
      page.text(M, y, when, { size: 9.5, color: INK });
      page.text(M + 110, y, p.method, { size: 9.5, color: INK });
      page.text(R - 8, y, ghs(p.amount), { size: 9.5, color: INK, align: 'right' });
      y += 15;
    }
  }

  // Notes.
  const notes = [
    d.note,
    taxNote(data),
    'Thank you for choosing Hotel A-Wise. Questions about this document? Call or WhatsApp the front desk.',
  ].filter(Boolean) as string[];
  y += 16;
  for (const n of notes) {
    const w = wrap(n, R - M, 9);
    need(w.length * 12 + 6);
    w.forEach((line) => {
      page.text(M, y, line, { size: 9, color: MUTE });
      y += 12;
    });
    y += 4;
  }

  footer(page, doc.pages.length);
  return doc.toBytes();
}

export function pdfResponse(bytes: Uint8Array, filename: string): Response {
  return new Response(bytes as BodyInit, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'private, no-store',
      'x-robots-tag': 'noindex',
    },
  });
}
