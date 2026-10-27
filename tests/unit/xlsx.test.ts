import { describe, expect, it } from 'vitest';
import { colName, crc32, xlsx, zipStored } from '@/lib/xlsx';

/** Reads a stored ZIP back through its central directory. */
function unzip(b: Uint8Array) {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const end = b.length - 22;
  expect(v.getUint32(end, true)).toBe(0x06054b50);
  const n = v.getUint16(end + 10, true);
  let p = v.getUint32(end + 16, true);
  const files: Record<string, string> = {};
  const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    expect(v.getUint32(p, true)).toBe(0x02014b50);
    const crc = v.getUint32(p + 16, true);
    const size = v.getUint32(p + 20, true);
    const nameLen = v.getUint16(p + 28, true);
    const local = v.getUint32(p + 42, true);
    const name = dec.decode(b.subarray(p + 46, p + 46 + nameLen));
    expect(v.getUint32(local, true)).toBe(0x04034b50);
    expect(v.getUint16(local + 8, true)).toBe(0);
    expect(v.getUint32(local + 14, true)).toBe(crc);
    const start = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const data = b.subarray(start, start + size);
    expect(crc32(data)).toBe(crc);
    files[name] = dec.decode(data);
    p += 46 + nameLen;
  }
  return files;
}

describe('xlsx writer', () => {
  it('computes CRC-32 like zip tools do', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('names columns', () => {
    expect([0, 25, 26, 27, 701, 702].map(colName)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('packs a readable zip', () => {
    const z = unzip(zipStored([{ name: 'a.txt', data: new TextEncoder().encode('hello') }]));
    expect(z).toEqual({ 'a.txt': 'hello' });
  });

  it('writes a workbook with a bold header, numbers and escaped text', () => {
    const files = unzip(
      xlsx(
        [
          ['Ref', 'Guest', 'Total (GHS)'],
          ['AW-7K2Q', 'Ama & Kofi <VIP>', 1234.5],
          ['=HYPERLINK("x")', null, 0],
        ],
        'Bookings',
      ),
    );
    expect(Object.keys(files).sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
    const sheet = files['xl/worksheets/sheet1.xml']!;
    expect(sheet).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Ref</t></is></c>');
    expect(sheet).toContain('<c r="C2"><v>1234.5</v></c>');
    expect(sheet).toContain('Ama &amp; Kofi &lt;VIP&gt;');
    // Text is never a formula in an inline string.
    expect(sheet).toContain('<t xml:space="preserve">=HYPERLINK(&quot;x&quot;)</t>');
    expect(sheet).not.toContain('<f>');
    expect(files['xl/workbook.xml']).toContain('name="Bookings"');
  });
});
