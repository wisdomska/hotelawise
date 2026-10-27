'use client';
// Last-resort error page, in the site's own look rather than Next.js's default.
// The common cause is a tab that was open during a deploy: its next click asks for script
// files the new version no longer has. That case reloads itself once, straight away.
import { useEffect } from 'react';
import { cormorant, geist } from './fonts';
import './globals.css';

const STALE = /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed/i;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const stale = STALE.test(`${error.name} ${error.message}`);
  useEffect(() => {
    if (!stale) return;
    // At most one automatic reload a minute, so a real outage can't loop.
    try {
      const last = Number(sessionStorage.getItem('aw.staleReload') ?? 0);
      if (Date.now() - last < 60_000) return;
      sessionStorage.setItem('aw.staleReload', String(Date.now()));
    } catch {
      // Storage blocked: reload anyway, once per page view.
    }
    window.location.reload();
  }, [stale]);

  return (
    <html lang="en-GB" className={`${cormorant.variable} ${geist.variable}`}>
      <body style={{ margin: 0, background: '#F5F2EA', color: '#00003A', fontFamily: 'var(--font-sans)' }}>
        <main
          style={{
            minHeight: '100svh',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            gap: 20,
            padding: '48px var(--pad, 20px)',
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>Hotel A-Wise</span>
          <h1 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 'clamp(36px, 6vw, 64px)', lineHeight: 1 }}>
            {stale ? 'Loading the latest version…' : 'This page didn’t load.'}
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
            {stale
              ? 'We just updated the site. One moment.'
              : 'Please try again. If it keeps happening, call reception; the desk is open all night.'}
          </p>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => (stale ? window.location.reload() : reset())}
              style={{
                height: 48,
                padding: '0 20px',
                borderRadius: 10,
                border: 'none',
                background: '#000063',
                color: '#F5F2EA',
                fontSize: 15,
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- a full page load: the app's own navigation may be what broke */}
            <a
              href="/"
              style={{
                height: 48,
                padding: '0 20px',
                borderRadius: 10,
                border: '1px solid #000063',
                color: '#00003A',
                fontSize: 15,
                display: 'inline-flex',
                alignItems: 'center',
                textDecoration: 'none',
              }}
            >
              Go to the home page
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
