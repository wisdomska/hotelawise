'use client';
// Venues & enquiry (Checkout.dc.html › VENUES): two spaces, a guest-count
// picker with a capacity bar, and the enquiry form.
import { useState } from 'react';
import { sendEnquiry, type EnquiryErrors } from '@/app/(site)/(checkout)/venues/actions';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { notify } from '@/components/ui/toaster';
import { todayInAccra } from '@/lib/dates';
import type { SiteImage as SiteImageT } from '@/server/content/site-data';
import { SiteImage } from '../site/site-image';
import { Turnstile } from '../site/turnstile';

export type VenueCard = {
  slug: string;
  name: string;
  label: string;
  description: string;
  min: number;
  max: number;
  image: SiteImageT | null;
};

const mono = 'var(--font-mono)';
const field = (bad?: boolean): React.CSSProperties => ({
  height: 48,
  padding: '0 14px',
  borderRadius: 10,
  border: `1.5px solid ${bad ? '#B42318' : 'rgba(0,0,58,0.5)'}`,
  background: '#F5F2EA',
  fontSize: 16,
  color: '#00003A',
});

export function VenuesView({ venues, intro, turnstileSiteKey }: { venues: VenueCard[]; intro: string; turnstileSiteKey: string | null }) {
  const [vi, setVi] = useState(0);
  const v = venues[vi]!;
  const [vf, setVf] = useState({ date: '', guests: 150, name: '', phone: '', notes: '' });
  const [ve, setVe] = useState<EnquiryErrors>({});
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [turnstile, setTurnstile] = useState<string | null>(null);

  const g = Math.min(v.max, Math.max(v.min, vf.guests));
  const big = v.min >= 100;
  const st = big ? 10 : 5;
  const ticks = big ? [100, 125, 150, 175, 200] : [10, 20, 30, 45, 60];
  const setG = (n: number) => setVf({ ...vf, guests: Math.min(v.max, Math.max(v.min, n)) });
  const filled = Math.round(((g - v.min) / Math.max(1, v.max - v.min)) * 20);
  const venueName = v.name.toLowerCase().replace('event ', 'the ').replace('conference', 'the conference');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await sendEnquiry({ venue: v.slug, date: vf.date, guests: g, name: vf.name, phone: vf.phone, notes: vf.notes, turnstile });
    setBusy(false);
    if (!r.ok) {
      if (r.errors) setVe(r.errors);
      if (r.error) setErr(r.error);
      return;
    }
    setSent(r.ref);
    setVf({ date: '', guests: big ? 150 : 20, name: '', phone: '', notes: '' });
    notify('Enquiry sent.', 'The events desk will call you within the hour.');
  };

  return (
    <section data-screen-label="Venues & enquiry" style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c2)', gap: 32, alignItems: 'end' }}>
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
          Host it <em style={{ fontWeight: 300 }}>at ours.</em>
        </h1>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>{intro}</p>
      </div>
      <div data-stagger="" style={{ display: 'grid', gridTemplateColumns: 'var(--c2)', gap: 20 }}>
        {venues.map((x, i) => {
          const on = vi === i;
          return (
            <article key={x.slug} data-mi-card="" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ position: 'relative', aspectRatio: '4/3', overflow: 'hidden', borderRadius: 16, background: '#F6E2B3' }}>
                {x.image && (
                  <SiteImage
                    data-mi-img=""
                    image={x.image}
                    fill
                    sizes="(min-width: 640px) 50vw, 100vw"
                    style={{ objectFit: 'cover', filter: 'saturate(0.9) contrast(1.04)' }}
                  />
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 30 }}>{x.name}</h2>
                <span style={{ fontFamily: mono, fontSize: 13 }}>{x.label}</span>
              </div>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>{x.description}</p>
              <button
                type="button"
                onClick={() => {
                  setVi(i);
                  setVf({ ...vf, guests: Math.min(Math.max(vf.guests, x.min), x.max) });
                  document.getElementById('venue-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                aria-pressed={on}
                data-mi-btn={on ? 'fill' : 'ghost'}
                style={{
                  alignSelf: 'flex-start',
                  height: 44,
                  padding: '0 16px',
                  borderRadius: 10,
                  border: '1px solid #000063',
                  background: on ? '#000063' : 'transparent',
                  color: on ? '#F5F2EA' : '#000063',
                  fontSize: 14,
                }}
              >
                {on ? 'Selected below' : 'Enquire about this'}
              </button>
            </article>
          );
        })}
      </div>
      {sent && (
        <div
          role="status"
          style={{
            padding: 24,
            borderRadius: 20,
            background: '#00003A',
            color: '#F5F2EA',
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            animation: 'aw-pop 260ms var(--ease-enter)',
          }}
        >
          <span style={{ fontFamily: mono, fontSize: 12, color: '#F2B544' }}>ENQUIRY {sent} RECEIVED</span>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 28 }}>
            Thank you. The events desk will call you within the hour with a quote.
          </span>
        </div>
      )}
      <form
        id="venue-form"
        onSubmit={submit}
        noValidate
        aria-label="Venue enquiry"
        style={{
          display: 'grid',
          gridTemplateColumns: 'var(--c2)',
          gap: 16,
          background: '#FFFFFF',
          border: '1px solid rgba(0,0,99,0.14)',
          borderRadius: 20,
          padding: 24,
          scrollMarginTop: 96,
        }}
      >
        <span style={{ gridColumn: '1 / -1', fontFamily: 'var(--font-serif)', fontSize: 26 }}>Enquire about {venueName}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="calendar" size={16} />
            Event date
          </span>
          <DatePicker
            variant="field"
            label="Event date"
            placeholder="Pick the day"
            value={vf.date}
            min={todayInAccra()}
            withYear
            error={!!ve.date}
            onChange={(d) => {
              setVf({ ...vf, date: d });
              setVe({ ...ve, date: undefined });
            }}
          />
          {ve.date && (
            <span role="alert" style={{ color: '#B42318', fontSize: 12 }}>
              {ve.date}
            </span>
          )}
        </div>
        <div
          role="group"
          aria-label="Number of guests"
          style={{
            gridColumn: '1 / -1',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            padding: 16,
            borderRadius: 20,
            background: '#F5F2EA',
            border: '1.5px solid rgba(0,0,99,0.12)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13 }}>How many guests?</span>
              <span style={{ fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>
                {g >= v.max
                  ? `That's the ${v.name.toLowerCase()} at full house.`
                  : `${v.name} holds ${v.min}–${v.max}. Room for ${v.max - g} more.`}
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                border: '1.5px solid rgba(0,0,58,0.5)',
                borderRadius: 10,
                background: '#FFFFFF',
                overflow: 'hidden',
              }}
            >
              <button
                type="button"
                onClick={() => setG(g - st)}
                disabled={g <= v.min}
                aria-label={`${st} fewer guests`}
                className="aw-press"
                style={{ width: 48, height: 52, border: 'none', background: 'transparent', fontSize: 20, opacity: g <= v.min ? 0.35 : 1 }}
              >
                −
              </button>
              <div
                aria-live="polite"
                style={{ minWidth: 92, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
              >
                <span style={{ fontFamily: mono, fontSize: 24, fontWeight: 500, lineHeight: 1 }}>{g}</span>
                <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(0,0,58,0.55)', marginTop: 3 }}>
                  GUESTS
                </span>
              </div>
              <button
                type="button"
                onClick={() => setG(g + st)}
                disabled={g >= v.max}
                aria-label={`${st} more guests`}
                className="aw-press"
                style={{ width: 48, height: 52, border: 'none', background: 'transparent', fontSize: 20, opacity: g >= v.max ? 0.35 : 1 }}
              >
                +
              </button>
            </div>
          </div>
          <div
            role="radiogroup"
            aria-label="Quick pick"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5,minmax(0,1fr))',
              gap: 4,
              padding: 4,
              borderRadius: 10,
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,99,0.12)',
            }}
          >
            {ticks.map((n) => (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={g === n}
                onClick={() => setG(n)}
                className="aw-press"
                style={{
                  height: 'max(40px, var(--tap-min, 0px))',
                  border: 'none',
                  borderRadius: 7,
                  background: g === n ? '#000063' : 'transparent',
                  color: g === n ? '#F5F2EA' : '#00003A',
                  fontFamily: mono,
                  fontSize: 13,
                  transition: 'background 180ms var(--ease-enter)',
                }}
              >
                {n}
              </button>
            ))}
          </div>
          <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'repeat(20,1fr)', gap: 3 }}>
            {Array.from({ length: 20 }, (_, i) => (
              <span
                key={i}
                style={{
                  height: 8,
                  borderRadius: 2,
                  background: i < Math.max(1, filled) ? (g >= v.max ? '#F2B544' : '#000063') : 'rgba(0,0,99,0.12)',
                  transition: 'background 200ms var(--ease-enter)',
                }}
              />
            ))}
          </div>
          <span style={{ fontFamily: mono, fontSize: 11, color: 'rgba(0,0,58,0.6)' }}>
            {big
              ? `SUGGESTED: ${Math.ceil(g / 40)} CANOPIES · ${g} CHAIRS · ${Math.ceil(g / 8)} TABLES`
              : `SUGGESTED: ${Math.ceil(g / 6)} TABLES · ${g} CHAIRS, CLASSROOM OR BOARDROOM`}
          </span>
        </div>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="user" size={16} />
            Name
          </span>
          <input
            autoComplete="name"
            autoCapitalize="words"
            enterKeyHint="next"
            value={vf.name}
            maxLength={200}
            onChange={(e) => {
              setVf({ ...vf, name: e.target.value });
              setVe({ ...ve, name: undefined });
            }}
            placeholder="e.g. Lydia Mensah"
            aria-invalid={!!ve.name}
            style={field(!!ve.name)}
          />
          {ve.name && (
            <span role="alert" style={{ color: '#B42318', fontSize: 12 }}>
              {ve.name}
            </span>
          )}
        </label>
        <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="phone" size={16} />
            Phone
          </span>
          <input
            type="tel"
            autoComplete="tel-national"
            enterKeyHint="next"
            inputMode="tel"
            value={vf.phone}
            onChange={(e) => {
              setVf({ ...vf, phone: e.target.value });
              setVe({ ...ve, phone: undefined });
            }}
            placeholder="055 555 7090"
            aria-invalid={!!ve.phone}
            style={{ ...field(!!ve.phone), fontFamily: mono }}
          />
          {ve.phone && (
            <span role="alert" style={{ color: '#B42318', fontSize: 12 }}>
              {ve.phone}
            </span>
          )}
        </label>
        <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
          Tell us about it
          <textarea
            value={vf.notes}
            maxLength={2000}
            onChange={(e) => setVf({ ...vf, notes: e.target.value })}
            rows={3}
            placeholder="Wedding reception, 150 guests, we'd like canopies and catering space…"
            style={{ ...field(), height: 'auto', padding: '12px 14px', fontFamily: 'inherit' }}
          />
        </label>
        <div style={{ gridColumn: '1 / -1' }}>
          <Turnstile siteKey={turnstileSiteKey} onToken={setTurnstile} />
        </div>
        {err && (
          <p role="alert" style={{ gridColumn: '1 / -1', margin: 0, fontSize: 14, color: '#B42318' }}>
            {err}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          data-mi-btn="fill"
          style={{
            gridColumn: '1 / -1',
            minHeight: 52,
            border: 'none',
            borderRadius: 10,
            background: '#000063',
            color: '#F5F2EA',
            fontSize: 15,
            fontWeight: 500,
          }}
        >
          {busy ? 'Sending…' : 'Send enquiry'}
        </button>
      </form>
    </section>
  );
}
