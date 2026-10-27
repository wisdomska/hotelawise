'use client';
// Manage my booking (Checkout.dc.html › MANAGE BOOKING), with the code step:
// reference + phone, then the 6-digit code we text, then the booking.
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cancelBooking, checkDates, confirmCode, findBooking, leaveBooking, saveDates } from '@/app/(site)/(checkout)/manage/actions';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { notify } from '@/components/ui/toaster';
import { useScrollLock } from '@/components/ui/use-scroll-lock';
import { addDays, nightsBetween, todayInAccra } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import type { ManageView } from '@/server/services/manage-view';

const mono = 'var(--font-mono)';
const input = (bad: boolean): React.CSSProperties => ({
  height: 48,
  padding: '0 14px',
  borderRadius: 10,
  border: `1.5px solid ${bad ? '#B42318' : 'rgba(0,0,58,0.5)'}`,
  background: '#FFFFFF',
  fontSize: 16,
  fontFamily: mono,
  color: '#00003A',
});
const outline: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  height: 44,
  padding: '0 16px',
  borderRadius: 10,
  background: 'transparent',
  fontSize: 14,
};

function Label({ icon, children }: { icon: AnyIconName; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={16} />
      {children}
    </span>
  );
}

function CancelDialog({ view, onClose, onConfirm, busy }: { view: ManageView; onClose: () => void; onConfirm: () => void; busy: boolean }) {
  useScrollLock(true);
  const keepRef = useRef<HTMLButtonElement>(null);
  useEffect(() => keepRef.current?.focus(), []);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cancel booking"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 90,
        background: 'rgba(0,0,40,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
        animation: 'aw-fade 200ms var(--ease-enter)',
      }}
    >
      <div
        style={{
          width: 'min(440px,100%)',
          maxHeight: 'calc(100dvh - 32px)',
          overflowY: 'auto',
          overscrollBehavior: 'contain',
          background: '#FFFFFF',
          borderRadius: 22,
          padding: 24,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          animation: 'aw-pop 260ms var(--ease-enter)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26 }}>Cancel {view.ref}?</span>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'rgba(0,0,58,0.75)' }}>{view.cancelBody}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
          <button
            ref={keepRef}
            type="button"
            onClick={onClose}
            data-mi-btn="ghost"
            style={{ ...outline, border: '1px solid rgba(0,0,99,0.3)' }}
          >
            Keep my booking
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            style={{ ...outline, border: 'none', background: '#B42318', color: '#FFFFFF' }}
          >
            {busy ? 'Cancelling…' : 'Yes, cancel it'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ManageBooking({ view, initialRef }: { view: ManageView | null; initialRef: string }) {
  const router = useRouter();
  const [ref, setRef] = useState(initialRef);
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [codeFor, setCodeFor] = useState<{ ref: string; sentTo: string[] } | null>(null);
  const [code, setCode] = useState('');
  const [editing, setEditing] = useState(false);
  const [mCi, setMCi] = useState(view?.checkIn ?? todayInAccra());
  const [mCo, setMCo] = useState(view?.checkOut ?? addDays(todayInAccra(), 1));
  const [avail, setAvail] = useState<{ key: string; ok: boolean; note: string; tone: 'good' | 'bad' | 'neutral' } | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const today = todayInAccra();

  const key = `${mCi}|${mCo}`;
  useEffect(() => {
    if (!editing) return;
    let live = true;
    const t = setTimeout(() => checkDates(mCi, mCo).then((r) => live && setAvail({ key: `${mCi}|${mCo}`, ...r })), 200);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [editing, mCi, mCo]);
  const availNow = avail?.key === key ? avail : null;

  const lookup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const r = await findBooking(ref, phone);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setCodeFor({ ref: r.ref, sentTo: r.sentTo });
    setCode('');
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeFor) return;
    setBusy(true);
    setErr(null);
    const r = await confirmCode(codeFor.ref, code);
    setBusy(false);
    if (!r.ok) return setErr(r.error);
    setCodeFor(null);
    router.refresh();
  };

  const busyBtn: React.CSSProperties = {
    height: 50,
    border: 'none',
    borderRadius: 10,
    background: '#000063',
    color: '#F5F2EA',
    fontSize: 15,
    fontWeight: 500,
  };

  return (
    <section
      data-screen-label="Manage my booking"
      style={{ display: 'grid', gridTemplateColumns: 'var(--c-main)', gap: 40, alignItems: 'start' }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
          Manage <em style={{ fontWeight: 300 }}>my booking.</em>
        </h1>
        {view ? (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
            You&apos;re looking at {view.ref}.{' '}
            <button
              type="button"
              onClick={async () => {
                await leaveBooking();
                router.refresh();
              }}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                color: '#000063',
                textDecoration: 'underline',
                textUnderlineOffset: 3,
                fontSize: 15,
              }}
            >
              Look up another booking
            </button>
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)' }}>
            Your reference is in the SMS we sent, and looks like <span style={{ fontFamily: mono }}>AW-7Q3K</span>. We&apos;ll text a code
            to the phone you booked with.
          </p>
        )}
        {!view && !codeFor && (
          <form
            onSubmit={lookup}
            noValidate
            aria-label="Find my booking"
            style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 440 }}
          >
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <Label icon="hash">Booking reference</Label>
              <input
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                value={ref}
                onChange={(e) => {
                  setRef(e.target.value);
                  setErr(null);
                }}
                placeholder="AW-XXXX"
                aria-invalid={!!err}
                style={{ ...input(!!err), textTransform: 'uppercase' }}
              />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <Label icon="phone">Phone number you booked with</Label>
              <input
                type="tel"
                autoComplete="tel-national"
                enterKeyHint="go"
                inputMode="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setErr(null);
                }}
                placeholder="055 555 7090"
                aria-invalid={!!err}
                style={input(!!err)}
              />
            </label>
            {err && (
              <span
                role="alert"
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: '#B42318' }}
              >
                <Icon name="alert" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{err}</span>
              </span>
            )}
            <button type="submit" disabled={busy} data-mi-btn="fill" style={busyBtn}>
              {busy ? 'Looking…' : 'Find my booking'}
            </button>
          </form>
        )}
        {!view && codeFor && (
          <form
            onSubmit={verify}
            noValidate
            aria-label="Enter your code"
            style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 440, animation: 'aw-up 300ms var(--ease-enter)' }}
          >
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>
              We&apos;ve sent a 6-digit code to {codeFor.sentTo.join(' and ')}. It works for 10 minutes.
            </p>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
              <Label icon="lock">Code</Label>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                  setErr(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                enterKeyHint="go"
                aria-invalid={!!err}
                placeholder="••••••"
                style={{ ...input(!!err), fontSize: 22, letterSpacing: '0.3em' }}
              />
            </label>
            {err && (
              <span
                role="alert"
                style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, lineHeight: 1.45, color: '#B42318' }}
              >
                <Icon name="alert" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{err}</span>
              </span>
            )}
            <button
              type="submit"
              disabled={busy || code.length !== 6}
              data-mi-btn="fill"
              style={{ ...busyBtn, opacity: code.length === 6 ? 1 : 0.5 }}
            >
              {busy ? 'Checking…' : 'Open my booking'}
            </button>
            <div style={{ display: 'flex', gap: 16, fontSize: 13 }}>
              <button
                type="button"
                onClick={async () => {
                  setBusy(true);
                  const r = await findBooking(codeFor.ref, phone);
                  setBusy(false);
                  if (r.ok) notify('New code sent.', `To ${r.sentTo.join(' and ')}.`);
                  else setErr(r.error);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: '#000063',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                Send a new code
              </button>
              <button
                type="button"
                onClick={() => {
                  setCodeFor(null);
                  setErr(null);
                }}
                style={{
                  border: 'none',
                  background: 'transparent',
                  padding: 0,
                  color: 'rgba(0,0,58,0.65)',
                  textDecoration: 'underline',
                  textUnderlineOffset: 3,
                }}
              >
                Use a different reference
              </button>
            </div>
          </form>
        )}
      </div>

      {view && (
        <div
          aria-live="polite"
          style={{
            background: '#FFFFFF',
            border: '1px solid rgba(0,0,99,0.14)',
            borderRadius: 20,
            padding: 24,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            animation: 'aw-pop 260ms var(--ease-enter)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 500 }}>{view.ref}</span>
            <span
              style={{
                fontFamily: mono,
                fontSize: 11.5,
                padding: '4px 10px',
                borderRadius: 999,
                background: view.statusBg,
                color: view.statusFg,
              }}
            >
              {view.status}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>{view.title}</span>
            <span style={{ fontSize: 14, color: 'rgba(0,0,58,0.72)' }}>
              {view.range} · {view.guestsLabel} · {view.guest}
            </span>
          </div>
          <div
            style={{
              fontFamily: mono,
              fontSize: 13,
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              borderTop: '1.5px dashed rgba(0,0,99,0.3)',
              paddingTop: 12,
            }}
          >
            {view.lines.map((l) => (
              <div key={l.k} style={{ display: 'flex', alignItems: 'baseline', gap: 8, color: l.color, fontWeight: l.weight }}>
                <span>{l.k}</span>
                <span style={{ flex: 1, borderBottom: '1.5px dotted rgba(0,0,58,0.3)', transform: 'translateY(-4px)' }} />
                <span>{l.v}</span>
              </div>
            ))}
          </div>
          {view.cancelled && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55 }}>{view.cancelNote}</p>}
          {view.locked && (
            <p style={{ margin: 0, display: 'flex', gap: 8, fontSize: 14, lineHeight: 1.55, color: 'rgba(0,0,58,0.75)' }}>
              <Icon name="info" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{view.lockNote}</span>
            </p>
          )}
          {view.active && (
            <>
              {editing && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 12, background: '#F6E2B3' }}>
                  <span style={{ fontSize: 14, fontWeight: 500 }}>Pick new dates</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <DatePicker
                      variant="field"
                      bg="#FFFFFF"
                      label="New check-in"
                      value={mCi}
                      min={today}
                      rangeStart={mCi}
                      rangeEnd={mCo}
                      onChange={(v) => {
                        setMCi(v);
                        if (nightsBetween(v, mCo) < 1) setMCo(addDays(v, 1));
                      }}
                    />
                    <DatePicker
                      variant="field"
                      bg="#FFFFFF"
                      label="New check-out"
                      value={mCo}
                      min={addDays(mCi, 1)}
                      rangeStart={mCi}
                      rangeEnd={mCo}
                      onChange={setMCo}
                    />
                  </div>
                  <span
                    aria-live="polite"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.45,
                      color: !availNow
                        ? 'rgba(0,0,58,0.65)'
                        : availNow.tone === 'good'
                          ? '#1F7A4D'
                          : availNow.tone === 'bad'
                            ? '#B42318'
                            : 'rgba(0,0,58,0.65)',
                    }}
                  >
                    {availNow ? availNow.note : 'Checking those dates…'}
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      disabled={!availNow?.ok || busy}
                      onClick={async () => {
                        setBusy(true);
                        const r = await saveDates(mCi, mCo);
                        setBusy(false);
                        if (!r.ok) return notify(r.error);
                        setEditing(false);
                        notify('Dates changed.', "We've sent a new confirmation by SMS.");
                        router.refresh();
                      }}
                      style={{ ...outline, border: 'none', background: '#000063', color: '#F5F2EA', opacity: availNow?.ok ? 1 : 0.5 }}
                    >
                      Confirm new dates
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(false);
                        setMCi(view.checkIn);
                        setMCo(view.checkOut);
                      }}
                      data-mi-btn="ghost"
                      style={{ ...outline, border: '1px solid rgba(0,0,99,0.3)' }}
                    >
                      Keep current dates
                    </button>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  disabled={editing}
                  onClick={() => {
                    setEditing(true);
                    setMCi(view.checkIn);
                    setMCo(view.checkOut);
                  }}
                  data-mi-btn="ghost"
                  style={{ ...outline, border: '1px solid #000063', opacity: editing ? 0.5 : 1 }}
                >
                  <Icon name="calendar" size={16} />
                  Change dates
                </button>
                <button
                  type="button"
                  onClick={() => setCancelOpen(true)}
                  style={{ ...outline, border: '1px solid #B42318', color: '#B42318' }}
                >
                  <Icon name="ban" size={16} />
                  Cancel booking
                </button>
              </div>
              <span style={{ display: 'flex', gap: 8, fontSize: 12.5, lineHeight: 1.5, color: 'rgba(0,0,58,0.65)' }}>
                <Icon name="info" size={15} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{view.policyNote}</span>
              </span>
            </>
          )}
        </div>
      )}
      {view && cancelOpen && (
        <CancelDialog
          view={view}
          busy={busy}
          onClose={() => setCancelOpen(false)}
          onConfirm={async () => {
            setBusy(true);
            const r = await cancelBooking();
            setBusy(false);
            setCancelOpen(false);
            if (!r.ok) return notify(r.error);
            notify('Booking cancelled.', r.refund ? `${formatGhs(r.refund)} refund on its way.` : 'The room is back on sale.');
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
