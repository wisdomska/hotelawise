// Rooms (Website.dc.html › ROOMS): filters, key cards and the side-by-side table.
import type { Metadata } from 'next';
import Link from 'next/link';
import { priceLabel } from '@/components/site/key-card';
import { RoomsFilter } from '@/components/site/rooms-filter';
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
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--c2)', gap: 32, alignItems: 'end', marginBottom: 40 }}>
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
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)', maxWidth: 440 }}>
            {data.content['pages.roomsIntro']}
          </p>
        </div>
        <RoomsFilter rooms={data.rooms} images={images} left={left} tel={contact.tel} />
        <div style={{ marginTop: 'var(--sy)' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 20,
            }}
          >
            <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 'var(--h3)' }}>Side by side</h2>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>
              Scroll sideways on small screens →
            </span>
          </div>
          <div style={{ overflowX: 'auto', borderTop: '1.5px solid #000063' }} tabIndex={0} role="region" aria-label="Room comparison">
            <table style={{ width: '100%', minWidth: 720, borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr>
                  <th
                    scope="col"
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
                  <th scope="row" style={{ padding: '14px 12px 14px 0' }} />
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
          </div>
        </div>
      </section>
    </main>
  );
}
