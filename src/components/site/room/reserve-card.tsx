'use client';
// Room page › Reserve (Website.dc.html › ROOM DETAIL aside): rate tier, dates,
// guests, extras and a running receipt. Availability for the chosen dates comes
// from the server; the room itself is held only at checkout.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon } from '@/components/ui/icon';
import { useScrollLock } from '@/components/ui/use-scroll-lock';
import { addDays, formatDayMonth, nightsBetween, todayInAccra, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import type { SiteRoom } from '@/server/content/site-data';
import { stayPrice, type RateRule } from '@/server/services/pricing';
import { checkRoomAvailability } from '@/app/(site)/actions';
import { leftLabel } from '../key-card';

export type ReserveProps = {
  room: SiteRoom;
  rules: RateRule[];
  breakfastPerGuestNight: number;
  roomServiceFee: number;
  holdMinutes: number;
  left?: number;
  contact: { phone: string; tel: string; wa: string };
  initial: { ci?: string; co?: string; guests?: number; tier?: number };
};

const tapBtn: React.CSSProperties = {
  width: 'max(36px, var(--tap-min, 0px))',
  height: 'max(36px, var(--tap-min, 0px))',
  borderRadius: 8,
  border: '1px solid rgba(0,0,99,0.25)',
  background: '#FFFFFF',
};
const leader: React.CSSProperties = {
  flex: 1,
  borderBottom: '1.5px dotted rgba(0,0,58,0.35)',
  margin: '0 8px',
  transform: 'translateY(-4px)',
};

function tone(left: number): [string, string] {
  return left === 0 ? ['#E9E2E2', '#B42318'] : ['#F6E2B3', '#000063'];
}

export function ReserveCard(p: ReserveProps) {
  const { room } = p;
  const today = todayInAccra();
  const validCi = p.initial.ci && p.initial.ci >= today ? p.initial.ci : today;
  const [ci, setCi] = useState<IsoDate>(validCi);
  const [co, setCo] = useState<IsoDate>(p.initial.co && p.initial.co > validCi ? p.initial.co : addDays(validCi, 2));
  const [guests, setGuests] = useState(Math.min(Math.max(1, p.initial.guests ?? 2), room.sleeps));
  const [tier, setTier] = useState(Math.min(Math.max(0, p.initial.tier ?? 0), room.variants.length - 1));
  const [breakfast, setBreakfast] = useState(false);
  const [roomService, setRoomService] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [drag, setDrag] = useState<{ start: number; t: number; dy: number } | null>(null);
  const [free, setFree] = useState<{ key: string; free: number; error?: string } | null>(null);
  useScrollLock(drawer);

  const variant = room.variants[tier]!;
  const hasTiers = room.variants.length > 1;
  const nights = Math.max(0, nightsBetween(ci, co));
  const key = `${variant.code}|${ci}|${co}`;

  useEffect(() => {
    if (nightsBetween(ci, co) < 1) return;
    let live = true;
    checkRoomAvailability(variant.code, ci, co).then(
      (r) => live && setFree(r.ok ? { key, free: r.free } : { key, free: -1, error: r.error }),
      () => live && setFree(null),
    );
    return () => {
      live = false;
    };
  }, [variant.code, ci, co, key]);

  useEffect(() => {
    if (!drawer) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDrawer(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawer]);

  // Unknown (still checking, or the check failed) counts as bookable: the hold at checkout decides.
  const freeSel = free && free.key === key && !free.error ? free.free : null;
  const price = stayPrice(variant.code, variant.price, ci, nights, p.rules);
  const receipt: { label: string; amt: string }[] = [
    {
      label: `${hasTiers ? variant.name.toUpperCase() : room.code} × ${nights} night${nights === 1 ? '' : 's'}`,
      amt: formatGhs(price.base),
    },
    ...price.lines.map((l) => ({ label: l.name.toUpperCase(), amt: `${l.amount < 0 ? '− ' : '+ '}${formatGhs(Math.abs(l.amount))}` })),
  ];
  let total = price.total;
  if (breakfast) {
    const amount = p.breakfastPerGuestNight * guests * nights;
    receipt.push({ label: `BREAKFAST × ${guests} × ${nights}`, amt: formatGhs(amount) });
    total += amount;
  }
  if (roomService) {
    receipt.push({ label: 'ROOM SERVICE', amt: formatGhs(p.roomServiceFee) });
    total += p.roomServiceFee;
  }
  const unavailable = nights > 0 && freeSel === 0;
  const blocked = nights < 1 || freeSel === 0;
  const bookHref = `/book?ci=${ci}&co=${co}&g=${guests}&room=${room.code}&tier=${tier}&bf=${breakfast ? 1 : 0}&rs=${roomService ? 1 : 0}`;
  const badge = leftLabel(p.left);
  const [badgeBg, badgeFg] = tone(p.left ?? 0);

  const endDrag = (e: React.PointerEvent) => {
    if (!drag) return;
    const dy = Math.max(0, e.clientY - drag.start);
    const v = dy / Math.max(1, Date.now() - drag.t);
    setDrag(null);
    setDrawer(!(dy > 140 || v > 0.5));
  };

  return (
    <>
      {drawer && (
        <div
          className="aw-reserve-scrim"
          onClick={() => setDrawer(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,58,0.45)', zIndex: 60, animation: 'aw-fade 240ms var(--ease-enter)' }}
        />
      )}
      <aside
        aria-label="Reserve this room"
        className="aw-reserve"
        data-open={drawer || undefined}
        data-dragging={drag || undefined}
        style={drag ? ({ '--drag': `${drag.dy}px` } as React.CSSProperties) : undefined}
      >
        <div
          className="aw-reserve-handle"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            setDrag({ start: e.clientY, t: Date.now(), dy: 0 });
          }}
          onPointerMove={(e) => drag && setDrag({ ...drag, dy: Math.max(0, e.clientY - drag.start) })}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          style={{ padding: '10px 0 4px', touchAction: 'none', cursor: 'grab' }}
        >
          <div style={{ width: 44, height: 5, borderRadius: 3, background: 'rgba(0,0,58,0.2)', margin: '0 auto' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>Reserve {room.code}</span>
          {badge && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11,
                padding: '4px 8px',
                borderRadius: 999,
                background: badgeBg,
                color: badgeFg,
              }}
            >
              {badge}
            </span>
          )}
        </div>
        {hasTiers && (
          <div role="radiogroup" aria-label="Rate" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {room.variants.map((v, i) => {
              const on = i === tier;
              return (
                <button
                  key={v.code}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-mi-btn="chip"
                  onClick={() => setTier(i)}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    minHeight: 52,
                    padding: '8px 14px',
                    borderRadius: 10,
                    border: `1.5px solid ${on ? '#000063' : 'rgba(0,0,99,0.2)'}`,
                    background: on ? '#F6E2B3' : '#FFFFFF',
                    textAlign: 'left',
                    color: '#00003A',
                  }}
                >
                  <span style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 14, fontWeight: 500 }}>{v.name}</span>
                    {v.note && <span style={{ fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>{v.note}</span>}
                  </span>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 14 }}>{formatGhs(v.price)}</span>
                </button>
              );
            })}
          </div>
        )}
        <div
          style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flexShrink: 0, border: '1px solid rgba(0,0,99,0.2)', borderRadius: 10 }}
        >
          <div style={{ padding: '10px 12px', borderRight: '1px solid rgba(0,0,99,0.2)' }}>
            <DatePicker
              variant="bare"
              icon="calendar"
              label="Check-in"
              value={ci}
              min={today}
              rangeStart={ci}
              rangeEnd={co}
              onChange={(d) => {
                setCi(d);
                if (co <= d) setCo(addDays(d, 1));
              }}
            />
          </div>
          <div style={{ padding: '10px 12px' }}>
            <DatePicker
              variant="bare"
              icon="calendar"
              label="Check-out"
              value={co}
              min={addDays(ci, 1)}
              rangeStart={ci}
              rangeEnd={co}
              onChange={setCo}
            />
          </div>
          <div
            style={{
              gridColumn: 'span 2',
              padding: '10px 12px',
              borderTop: '1px solid rgba(0,0,99,0.2)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(0,0,58,0.6)' }}>
              GUESTS (MAX {room.sleeps})
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <button type="button" aria-label="Fewer guests" onClick={() => setGuests((g) => Math.max(1, g - 1))} style={tapBtn}>
                −
              </button>
              <span aria-live="polite" style={{ fontFamily: 'var(--font-mono)', minWidth: 14, textAlign: 'center' }}>
                {guests}
              </span>
              <button type="button" aria-label="More guests" onClick={() => setGuests((g) => Math.min(room.sleeps, g + 1))} style={tapBtn}>
                +
              </button>
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, minHeight: 32 }}>
            <input
              type="checkbox"
              checked={breakfast}
              onChange={(e) => setBreakfast(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#000063' }}
            />
            <Icon name="coffee" size={18} />
            Breakfast, 7–10am
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(0,0,58,0.62)' }}>
              {formatGhs(p.breakfastPerGuestNight)} per guest, per day
            </span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, minHeight: 32 }}>
            <input
              type="checkbox"
              checked={roomService}
              onChange={(e) => setRoomService(e.target.checked)}
              style={{ width: 18, height: 18, accentColor: '#000063' }}
            />
            <Icon name="bell" size={18} />
            Room service
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 12, color: 'rgba(0,0,58,0.62)' }}>
              + {formatGhs(p.roomServiceFee)}
            </span>
          </label>
        </div>
        <div
          style={{
            borderTop: '1.5px dashed rgba(0,0,99,0.3)',
            paddingTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            fontFamily: 'var(--font-mono)',
            fontSize: 13,
          }}
        >
          {receipt.map((l) => (
            <div key={l.label} style={{ display: 'flex', alignItems: 'baseline' }}>
              <span>{l.label}</span>
              <span style={leader} />
              <span>{l.amt}</span>
            </div>
          ))}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              fontSize: 16,
              fontWeight: 500,
              paddingTop: 6,
              borderTop: '1px solid rgba(0,0,99,0.2)',
              marginTop: 4,
            }}
          >
            <span>TOTAL</span>
            <span style={{ flex: 1 }} />
            <span>{formatGhs(total)}</span>
          </div>
        </div>
        {free?.key === key && free.error && (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: '#B42318' }}>
            {free.error}
          </p>
        )}
        {unavailable && (
          <div
            role="alert"
            style={{
              display: 'flex',
              gap: 10,
              alignItems: 'flex-start',
              padding: '12px 14px',
              borderRadius: 10,
              background: '#FBE9E7',
              color: '#8A1C12',
              fontSize: 13.5,
              lineHeight: 1.45,
            }}
          >
            <Icon name="alert" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              The {hasTiers ? variant.name : room.name} room is fully booked between {formatDayMonth(ci)} and {formatDayMonth(co)}. Try
              other dates, another room, or call {p.contact.phone}.
            </span>
          </div>
        )}
        {blocked ? (
          <button
            type="button"
            disabled
            style={{
              minHeight: 52,
              border: 'none',
              borderRadius: 10,
              background: 'rgba(0,0,58,0.1)',
              color: 'rgba(0,0,58,0.55)',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'not-allowed',
            }}
          >
            {nights < 1 ? 'Pick your dates' : 'Not available for these dates'}
          </button>
        ) : (
          <Link
            href={bookHref}
            data-mi-btn="fill"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              minHeight: 52,
              borderRadius: 10,
              background: '#000063',
              color: '#F5F2EA',
              fontWeight: 600,
              textDecoration: 'none',
              fontSize: 15,
            }}
          >
            Continue to book
            <Icon name="arrowright" size={16} />
          </Link>
        )}
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'rgba(0,0,58,0.6)' }}>
          No charge yet. We hold your room for {p.holdMinutes} minutes while you check out. Prefer to talk? <a href={p.contact.tel}>Call</a>{' '}
          or <a href={p.contact.wa}>WhatsApp</a> {p.contact.phone}.
        </p>
      </aside>
      <div
        className="aw-reserve-bar"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
          background: 'rgba(245,242,234,0.7)',
          WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
          backdropFilter: 'blur(20px) saturate(1.4)',
          borderTop: '1px solid rgba(255,255,255,0.6)',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 500 }}>
            {formatGhs(variant.price)} <span style={{ fontWeight: 400, opacity: 0.6 }}>/night</span>
          </span>
          <span style={{ fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>
            {nights > 0 ? `${nights} night${nights === 1 ? '' : 's'}` : '—'} · {formatGhs(total)}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setDrawer(true)}
          aria-expanded={drawer}
          data-mi-btn="fill"
          style={{
            height: 48,
            padding: '0 22px',
            border: 'none',
            borderRadius: 10,
            background: '#000063',
            color: '#F5F2EA',
            fontWeight: 600,
            fontSize: 15,
          }}
        >
          Reserve
        </button>
      </div>
    </>
  );
}
