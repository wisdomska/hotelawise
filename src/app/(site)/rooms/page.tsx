// Rooms (Website.dc.html › ROOMS): filters, key cards and the side-by-side table.
import type { Metadata } from 'next';
import Link from 'next/link';
import { priceLabel } from '@/components/site/key-card';
import { RoomsFilter } from '@/components/site/rooms-filter';
import { ScrollTable } from '@/components/site/scroll-table';
import { leftTonight } from '@/server/content/availability';
import { contactFrom } from '@/server/content/contact';
import { getSiteData } from '@/server/content/site-data';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Rooms',
  description: 'Standard, Executive, VIP and Double rooms in New Asofan, Accra. Per room, per night, no hidden fees. From GHS 150.',
  alternates: { canonical: '/rooms' },
};

export default async function RoomsPage() {
  const data = await getSiteData();
  const left = await leftTonight(data);
  const contact = contactFrom(data);
  const images = Object.fromEntries(data.rooms.map((r) => [r.code, data.photos[`room.${r.code}`]!]));
  const rows: { label: string; cells: string[]; mono?: boolean }[] = [
    { label: 'Price / night', cells: data.rooms.map((r) => `GHS ${priceLabel(r)}`), mono: true },
    { label: 'Beds', cells: data.rooms.map((r) => r.beds) },
    { label: 'Guests', cells: data.rooms.map((r) => `Up to ${r.sleeps}`) },
    { label: 'Bathroom', cells: data.rooms.map((r) => r.bathroom) },
    { label: 'AC · Wi-Fi · TV', cells: data.rooms.map(() => 'Yes') },
    { label: 'Best for', cells: data.rooms.map((r) => r.bestFor) },
  ];
  return (
    <main id="main" style={{ paddingTop: 84 }}>
      <section data-screen-label="Rooms" style={{ padding: 'calc(var(--sy) * 0.6) var(--pad) var(--sy)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, alignItems: 'flex-start', marginBottom: 40 }}>
          <h1
            style={{
              margin: 0,
              fontFamily: 'var(--font-serif)',
              fontWeight: 400,
              fontSize: 'var(--h1)',
              lineHeight: 0.95,
              letterSpacing: '-0.05em',
            }}
          >
            Rooms<em style={{ fontWeight: 300 }}>, priced plainly.</em>
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>{data.content['pages.roomsIntro']}</p>
        </div>
        <RoomsFilter rooms={data.rooms} images={images} left={left} tel={contact.tel} />
        <div style={{ marginTop: 'var(--sy)' }}>
          <ScrollTable
            label="Room comparison"
            heading={
              <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 'var(--h3)' }}>
                Side by side comparison
              </h2>
            }
          >
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th
                    scope="col"
                    className="aw-sticky-col"
                    style={{
                      textAlign: 'left',
                      padding: '14px 12px 14px 0',
                      fontWeight: 400,
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      letterSpacing: '0.06em',
                      color: 'rgba(0,0,58,0.6)',
                    }}
                  >
                    ROOM
                  </th>
                  {data.rooms.map((r) => (
                    <th
                      key={r.code}
                      scope="col"
                      style={{ textAlign: 'left', padding: '14px 12px', fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 20 }}
                    >
                      {r.code}{' '}
                      <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 16 }}>{r.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.label} style={{ borderTop: '1px solid rgba(0,0,99,0.12)' }}>
                    <th
                      scope="row"
                      className="aw-sticky-col"
                      style={{
                        textAlign: 'left',
                        padding: '14px 12px 14px 0',
                        fontWeight: 400,
                        color: 'rgba(0,0,58,0.6)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {row.label}
                    </th>
                    {row.cells.map((cell, i) => (
                      <td key={i} style={{ padding: '14px 12px', fontFamily: row.mono ? 'var(--font-mono)' : 'inherit' }}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr style={{ borderTop: '1px solid rgba(0,0,99,0.12)' }}>
                  <th scope="row" className="aw-sticky-col" style={{ padding: '14px 12px 14px 0' }} />
                  {data.rooms.map((r) => (
                    <td key={r.code} style={{ padding: '14px 12px' }}>
                      <Link data-mi-card="" href={`/rooms/${r.code.toLowerCase()}`} style={{ fontSize: 14, fontWeight: 500 }}>
                        View {r.code} <span aria-hidden="true">→</span>
                      </Link>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </ScrollTable>
        </div>
      </section>
    </main>
  );
}
