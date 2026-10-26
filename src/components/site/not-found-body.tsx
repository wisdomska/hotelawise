// 404 (Website.dc.html › 404): the four room key cards instead of a dead end.
import Link from 'next/link';
import { leftTonight } from '@/server/content/availability';
import { getSiteData } from '@/server/content/site-data';
import { KeyCard } from './key-card';

export async function NotFoundBody() {
  const data = await getSiteData();
  const left = await leftTonight(data);
  return (
    <main id="main" style={{ paddingTop: 84 }}>
      <section data-screen-label="404" style={{ padding: 'calc(var(--sy) * 0.6) var(--pad) var(--sy)' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'rgba(0,0,58,0.6)' }}>ERROR 404 · ROOM NOT FOUND</span>
        <h1
          style={{
            margin: '16px 0 20px',
            fontFamily: 'var(--font-serif)',
            fontWeight: 400,
            fontSize: 'var(--h1)',
            lineHeight: 0.95,
            letterSpacing: '-0.05em',
            maxWidth: 900,
          }}
        >
          This room doesn&apos;t exist.
          <br />
          <em style={{ fontWeight: 300 }}>But these do.</em>
        </h1>
        <p style={{ margin: '0 0 48px', fontSize: 16, color: 'rgba(0,0,58,0.7)' }}>Try one of these instead.</p>
        <div data-stagger="" style={{ display: 'grid', gridTemplateColumns: 'var(--c4g)', gap: 'clamp(16px,2vw,28px)' }}>
          {data.rooms.map((room) => (
            <KeyCard
              key={room.code}
              room={room}
              image={data.photos[`room.${room.code}`]!}
              left={left[room.code]}
              sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
            />
          ))}
        </div>
        <Link href="/" style={{ display: 'inline-block', marginTop: 32, fontSize: 14, fontWeight: 500 }}>
          <span aria-hidden="true">←</span> Back to home
        </Link>
      </section>
    </main>
  );
}
