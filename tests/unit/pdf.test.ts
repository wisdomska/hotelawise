import { describe, expect, it } from 'vitest';
import { A4, PdfDoc, pdfString, textWidth, toWinAnsi, wrap } from '@/lib/pdf';

const latin1 = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join('');

function build() {
  const doc = new PdfDoc({ title: 'Receipt AW-7K2Q' });
  const p = doc.addPage();
  p.text(40, 60, 'Hotel A-Wise (Accra) \\ receipt', { size: 18, bold: true, color: '#00003A' });
  p.text(A4.w - 40, 60, 'GHS 1,234.00', { align: 'right' });
  p.line(40, 70, A4.w - 40, 70);
  p.rect(40, 80, 100, 20, { fill: '#F5F2EA' });
  doc.addPage().text(40, 40, 'Page two');
  return latin1(doc.toBytes(new Date('2026-10-26T12:00:00Z')));
}

describe('pdf writer', () => {
  it('writes a well-formed file whose xref offsets point at each object', () => {
    const s = build();
    expect(s.startsWith('%PDF-1.4\n')).toBe(true);
    expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const startxref = Number(/startxref\n(\d+)\n/.exec(s)![1]);
    expect(s.slice(startxref, startxref + 4)).toBe('xref');
    const [, count] = /xref\n0 (\d+)\n/.exec(s)!;
    const entries = s
      .slice(startxref)
      .split('\n')
      .slice(3, 2 + Number(count));
    entries.forEach((e, i) => {
      const off = Number(e.slice(0, 10));
      expect(s.slice(off, off + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`);
    });
    expect(s).toContain('/Count 2');
    expect(s).toContain('/BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding');
  });

  it('declares each content stream length in bytes', () => {
    const s = build();
    for (const m of s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)) {
      const start = m.index! + m[0].length;
      expect(s.slice(start + Number(m[1]), start + Number(m[1]) + 10)).toBe('\nendstream');
    }
  });

  it('escapes parentheses and backslashes in text', () => {
    expect(pdfString('a (b) \\ c')).toBe('(a \\(b\\) \\\\ c)');
    expect(build()).toContain('(Hotel A-Wise \\(Accra\\) \\\\ receipt) Tj');
  });

  it('maps text to WinAnsi', () => {
    expect(toWinAnsi('₵50 → Kofi’s · café – ok')).toBe('GHS 50 - Kofi\x92s \xb7 cafe \x96 ok');
    expect(toWinAnsi('漢')).toBe('?');
  });

  it('measures and right-aligns with the Helvetica widths', () => {
    expect(textWidth('A', 10)).toBeCloseTo(6.67);
    expect(textWidth('A', 10, true)).toBeCloseTo(7.22);
    expect(textWidth('GHS 1,234.00', 10)).toBeCloseTo(63.37, 2);
    const s = build();
    // Right edge at A4.w - 40 = 555.28, so the text starts 63.37pt to its left.
    const x = 555.28 - textWidth('GHS 1,234.00', 10);
    expect(s).toContain(`${Math.round(x * 100) / 100} `);
  });

  it('wraps long text within the width', () => {
    const lines = wrap('Free cancellation up to 48 hours before check-in. Inside 48 hours the deposit is kept.', 200, 10);
    expect(lines.length).toBeGreaterThan(1);
    for (const l of lines) expect(textWidth(l, 10)).toBeLessThanOrEqual(200);
    expect(wrap('Supercalifragilisticexpialidocious', 40, 10).every((l) => textWidth(l, 10) <= 40)).toBe(true);
  });
});
