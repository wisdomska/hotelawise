// Room detail (Website.dc.html › ROOM DETAIL): photos, amenities, house rules,
// the reserve card (a drawer on phones) and similar rooms.
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { AnyIconName } from '@/components/ui/icon';
import { Icon } from '@/components/ui/icon';
import { priceLabel } from '@/components/site/key-card';
import { ReserveCard } from '@/components/site/room/reserve-card';
import { RoomGallery } from '@/components/site/room/room-gallery';
import { JsonLd } from '@/components/site/json-ld';
import { SiteImage } from '@/components/site/site-image';
import { leftTonight } from '@/server/content/availability';
import { contactFrom } from '@/server/content/contact';
import { roomJsonLd, shareImage } from '@/server/content/seo';
import { getSiteData, setting, type SiteData, type SiteImage as SiteImageT } from '@/server/content/site-data';

type Params = { code: string };
type Search = Record<string, string | string[] | undefined>;

function findRoom(data: SiteData, code: string) {
  return data.rooms.find((r) => r.code.toLowerCase() === code.toLowerCase());
}

function roomRange(numbers: string[]): string {
  const sorted = [...numbers].sort();
  return sorted.length > 1 ? `${sorted[0]}–${sorted[sorted.length - 1]}` : (sorted[0] ?? '');
}

function amenityIcon(t: string): AnyIconName {
  if (/air|fan/i.test(t)) return 'snow';
  if (/wi-?fi/i.test(t)) return 'wifi';
  if (/tv/i.test(t)) return 'tv';
  if (/desk/i.test(t)) return 'laptop';
  if (/fridge/i.test(t)) return 'fridge';
  if (/bed/i.test(t)) return 'bed';
  if (/bath|shower/i.test(t)) return 'droplets';
  if (/linen/i.test(t)) return 'sparkle';
  return 'check';
}

function ruleIcon(t: string): AnyIconName {
  if (/check-in/i.test(t)) return 'clock';
  if (/arrive|quiet/i.test(t)) return 'moon';
  if (/smok/i.test(t)) return 'ban';
  if (/\bid\b/i.test(t)) return 'id';
  return 'info';
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { code } = await params;
  const data = await getSiteData();
  const room = findRoom(data, code);
  if (!room) return {};
  const photo = data.photos[`room.${room.code}`];
  return {
    title: `${room.name} Room`,
    description: `${room.blurb} From GHS ${priceLabel(room)} a night, up to ${room.sleeps} guests.`,
    alternates: { canonical: `/rooms/${room.code.toLowerCase()}` },
    openGraph: photo ? { images: [shareImage(photo)] } : undefined,
  };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function RoomPage({ params, searchParams }: { params: Promise<Params>; searchParams: Promise<Search> }) {
  const [{ code }, search, data] = await Promise.all([params, searchParams, getSiteData()]);
  const room = findRoom(data, code);
  if (!room) notFound();
  const [left, contact] = [await leftTonight(data), contactFrom(data)];
  const images = [0, 1, 2, 3].map((i) => data.photos[`room.${room.code}.${i}`]).filter((x): x is SiteImageT => !!x);
  if (data.photos[`room.${room.code}`]) images[0] = data.photos[`room.${room.code}`]!;
  const rules = (data.content['rooms.houseRules'] ?? '')
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const similar = data.rooms.filter((r) => r.code !== room.code);
  const g = Number(one(search.g));

  const listHead: React.CSSProperties = {
    margin: '0 0 12px',
    fontFamily: 'var(--font-mono)',
    fontWeight: 400,
    fontSize: 12,
    letterSpacing: '0.08em',
    color: 'rgba(0,0,58,0.6)',
  };
  const li: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '10px 0',
    borderBottom: '1px solid rgba(0,0,99,0.12)',
    fontSize: 15,
  };
  const badge: React.CSSProperties = {
    width: 34,
    height: 34,
    borderRadius: 10,
    color: '#000063',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };

  return (
    <main id="main" style={{ paddingTop: 84 }}>
      <JsonLd data={roomJsonLd(data, room)} />
      <section data-noreveal="" data-screen-label="Room detail" style={{ padding: '28px var(--pad) var(--sy)' }}>
        <nav
          aria-label="Breadcrumb"
          style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(0,0,58,0.6)', marginBottom: 24, display: 'flex', gap: 8 }}
        >
          <Link href="/rooms" style={{ color: 'rgba(0,0,58,0.6)' }}>
            Rooms
          </Link>
          <span aria-hidden="true">/</span>
          <span aria-current="page" style={{ color: '#00003A' }}>
            {room.code}
          </span>
        </nav>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--c-detail)', gap: 48, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 40, minWidth: 0 }}>
            <RoomGallery images={images} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 14,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: '#000063',
                    color: '#F5F2EA',
                  }}
                >
                  {room.code}
                </span>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>
                  ROOMS {roomRange(room.roomNumbers)}
                </span>
              </div>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--font-serif)',
                  fontWeight: 400,
                  fontSize: 'var(--h2)',
                  lineHeight: 1,
                  letterSpacing: '-0.05em',
                }}
              >
                {room.name} Room
              </h1>
              <p style={{ margin: 0, fontSize: 18, lineHeight: 1.55, color: 'rgba(0,0,58,0.75)', maxWidth: 600, textWrap: 'pretty' }}>
                {room.blurb}
              </p>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'var(--c2)', gap: 40 }}>
              <div>
                <h2 style={listHead}>IN THE ROOM</h2>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {room.amenities.map((a) => (
                    <li key={a} style={li}>
                      <span style={{ ...badge, background: '#F6E2B3' }}>
                        <Icon name={amenityIcon(a)} size={18} />
                      </span>
                      {a}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h2 style={listHead}>HOUSE RULES</h2>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {rules.map((r) => (
                    <li key={r} style={li}>
                      <span style={{ ...badge, background: 'rgba(0,0,99,0.06)' }}>
                        <Icon name={ruleIcon(r)} size={18} />
                      </span>
                      {r}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          <ReserveCard
            room={room}
            rules={data.rateRules}
            breakfastPerGuestNight={setting<number>(data, 'fees.breakfastPerGuestNightPesewas')}
            roomServiceFee={setting<number>(data, 'fees.roomServicePesewas')}
            holdMinutes={setting<number>(data, 'booking.holdMinutes')}
            left={left[room.code]}
            contact={{ phone: contact.phone, tel: contact.tel, wa: contact.wa }}
            initial={{
              ci: one(search.ci),
              co: one(search.co),
              guests: Number.isFinite(g) && g > 0 ? g : undefined,
              tier: Number(one(search.tier)) || 0,
            }}
          />
        </div>

        <div style={{ marginTop: 'var(--sy)' }}>
          <h2 style={{ margin: '0 0 24px', fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 'var(--h3)' }}>Similar rooms</h2>
          <div data-stagger="" style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 16 }}>
            {similar.map((r) => {
              const photo = data.photos[`room.${r.code}`]!;
              return (
                <Link
                  key={r.code}
                  data-mi-card=""
                  href={`/rooms/${r.code.toLowerCase()}`}
                  className="aw-keycard"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '96px minmax(0,1fr)',
                    gap: 14,
                    alignItems: 'center',
                    padding: 10,
                    border: '1px solid rgba(0,0,99,0.14)',
                    borderRadius: 20,
                    background: '#FFFFFF',
                    color: '#00003A',
                    textDecoration: 'none',
                  }}
                >
                  <div style={{ position: 'relative', height: 96, borderRadius: 16, overflow: 'hidden' }}>
                    <SiteImage data-mi-img="" image={photo} fill sizes="96px" grade={false} style={{ objectFit: 'cover' }} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 22, fontWeight: 500 }}>
                      {r.code}{' '}
                      <span style={{ fontFamily: 'var(--font-serif)', fontStyle: 'italic', fontWeight: 400, fontSize: 17 }}>{r.name}</span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'baseline', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      <span
                        style={{ flex: 1, borderBottom: '1.5px dotted rgba(0,0,58,0.35)', marginRight: 8, transform: 'translateY(-3px)' }}
                      />
                      GHS {priceLabel(r)} /night
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      <div className="aw-reserve-spacer" />
    </main>
  );
}
