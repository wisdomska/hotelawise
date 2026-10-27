// A small PDF 1.4 writer for invoices and receipts: A4 pages, the standard
// Helvetica fonts (WinAnsi), text, lines and rectangles. No dependencies, so it
// costs the Worker a few kilobytes instead of a PDF library.

export const A4 = { w: 595.28, h: 841.89 } as const;

type Rgb = readonly [number, number, number];
export type TextOpts = { size?: number; bold?: boolean; color?: string; align?: 'left' | 'right' | 'center' };

// Helvetica and Helvetica-Bold advance widths (1/1000 em) for ASCII 32–126, from the Adobe AFM files.
// prettier-ignore
const HELV = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
// prettier-ignore
const HELV_B = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];

/** WinAnsi codes outside ASCII that we print, with [regular, bold] widths. */
const EXTRA: Record<number, [number, number]> = {
  0x85: [1000, 1000], // …
  0x91: [222, 278], // ‘
  0x92: [222, 278], // ’
  0x93: [333, 500], // “
  0x94: [333, 500], // ”
  0x95: [350, 350], // •
  0x96: [556, 556], // –
  0x97: [1000, 1000], // —
  0xa0: [278, 278], // no-break space
  0xa9: [737, 737], // ©
  0xb7: [278, 278], // ·
  0xd7: [584, 584], // ×
};

const UNICODE_TO_WINANSI: Record<string, number> = {
  '…': 0x85,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  ' ': 0xa0,
  '©': 0xa9,
  '·': 0xb7,
  '×': 0xd7,
};

/**
 * Turns any string into WinAnsi bytes (as a binary string). Accented letters
 * keep their base letter; ₵ becomes "GHS", arrows and minus signs plain
 * ASCII; anything else unknown becomes "?".
 */
export function toWinAnsi(s: string): string {
  let out = '';
  for (const ch of s.replace(/₵/g, 'GHS ').replace(/[→⟶]/g, '-').replace(/[−‐‑]/g, '-')) {
    const c = ch.codePointAt(0)!;
    if (c >= 32 && c <= 126) out += ch;
    else if (UNICODE_TO_WINANSI[ch] !== undefined) out += String.fromCharCode(UNICODE_TO_WINANSI[ch]!);
    else if (ch === '\n' || ch === '\t') out += ' ';
    else {
      const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
      out += base.length === 1 && base.charCodeAt(0) >= 32 && base.charCodeAt(0) <= 126 ? base : '?';
    }
  }
  return out;
}

function charWidth(code: number, bold: boolean): number {
  if (code >= 32 && code <= 126) return (bold ? HELV_B : HELV)[code - 32]!;
  const e = EXTRA[code];
  return e ? e[bold ? 1 : 0] : 556;
}

/** Width in points of a string set in Helvetica (bold or not) at `size`. */
export function textWidth(s: string, size: number, bold = false): number {
  const w = toWinAnsi(s);
  let t = 0;
  for (let i = 0; i < w.length; i++) t += charWidth(w.charCodeAt(i), bold);
  return (t * size) / 1000;
}

/** Breaks text into lines no wider than `max` points (long words are split). */
export function wrap(s: string, max: number, size: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of s.split('\n')) {
    let cur = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = cur ? `${cur} ${word}` : word;
      if (textWidth(next, size, bold) <= max) {
        cur = next;
        continue;
      }
      if (cur) lines.push(cur);
      cur = word;
      while (textWidth(cur, size, bold) > max && cur.length > 1) {
        let cut = cur.length - 1;
        while (cut > 1 && textWidth(cur.slice(0, cut), size, bold) > max) cut--;
        lines.push(cur.slice(0, cut));
        cur = cur.slice(cut);
      }
    }
    lines.push(cur);
  }
  return lines;
}

function rgb(hex: string): Rgb {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [0, 0, 0];
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const col = (c: Rgb) => c.map(num).join(' ');

/** Escapes a WinAnsi string for a PDF literal string. */
export function pdfString(s: string): string {
  return '(' + s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/\r/g, '\\r') + ')';
}

/** One page. Coordinates are in points from the top-left corner. */
export class PdfPage {
  readonly ops: string[] = [];

  text(x: number, y: number, s: string, o: TextOpts = {}) {
    const size = o.size ?? 10;
    const bold = !!o.bold;
    const w = toWinAnsi(s);
    const width = textWidth(s, size, bold);
    const left = o.align === 'right' ? x - width : o.align === 'center' ? x - width / 2 : x;
    this.ops.push(
      `BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${col(rgb(o.color ?? '#000000'))} rg ${num(left)} ${num(A4.h - y)} Td ${pdfString(w)} Tj ET`,
    );
    return width;
  }

  line(x1: number, y1: number, x2: number, y2: number, o: { width?: number; color?: string } = {}) {
    this.ops.push(
      `${num(o.width ?? 0.5)} w ${col(rgb(o.color ?? '#000000'))} RG ${num(x1)} ${num(A4.h - y1)} m ${num(x2)} ${num(A4.h - y2)} l S`,
    );
  }

  rect(x: number, y: number, w: number, h: number, o: { fill?: string; stroke?: string; width?: number } = {}) {
    const parts = [];
    if (o.fill) parts.push(`${col(rgb(o.fill))} rg`);
    if (o.stroke) parts.push(`${num(o.width ?? 0.5)} w ${col(rgb(o.stroke))} RG`);
    parts.push(`${num(x)} ${num(A4.h - y - h)} ${num(w)} ${num(h)} re`);
    parts.push(o.fill && o.stroke ? 'B' : o.fill ? 'f' : 'S');
    this.ops.push(parts.join(' '));
  }
}

export class PdfDoc {
  readonly pages: PdfPage[] = [];
  constructor(readonly info: { title?: string; author?: string } = {}) {}

  addPage(): PdfPage {
    const p = new PdfPage();
    this.pages.push(p);
    return p;
  }

  /** The finished file. Every character is one byte, so string lengths are byte offsets. */
  toBytes(created = new Date()): Uint8Array {
    const pageIds = this.pages.map((_, i) => 6 + i * 2);
    const objs: string[] = [];
    objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[2] = `<< /Type /Pages /Kids [${pageIds.map((n) => `${n} 0 R`).join(' ')}] /Count ${this.pages.length} >>`;
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const d = created.toISOString().replace(/[-:T]/g, '').slice(0, 14);
    objs[5] = `<< /Producer (Hotel A-Wise) /CreationDate (D:${d}Z)${this.info.title ? ` /Title ${pdfString(toWinAnsi(this.info.title))}` : ''}${this.info.author ? ` /Author ${pdfString(toWinAnsi(this.info.author))}` : ''} >>`;
    this.pages.forEach((p, i) => {
      const content = p.ops.join('\n');
      objs[pageIds[i]!] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${pageIds[i]! + 1} 0 R >>`;
      objs[pageIds[i]! + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    for (let n = 1; n < objs.length; n++) {
      offsets[n] = out.length;
      out += `${n} 0 obj\n${objs[n]}\nendobj\n`;
    }
    const xref = out.length;
    out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let n = 1; n < objs.length; n++) out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
