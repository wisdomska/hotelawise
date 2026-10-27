'use client';
// Room booking (Checkout.dc.html › ROOM BOOKING): 1 dates & room, 2 your
// details, 3 pay. Leaving step 1 puts a real 15-minute hold on a room; paying
// goes through Paystack, and the server confirms only what Paystack verifies.
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  bookingAvailability,
  holdRoom,
  lookupPromo,
  onlinePaymentOn,
  releaseRoom,
  submitBooking,
} from '@/app/(site)/(checkout)/book/actions';
import { paymentState, sendMomoCode } from '@/app/(site)/(checkout)/pay-actions';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { Select } from '@/components/ui/select';
import { notify } from '@/components/ui/toaster';
import { ARRIVALS, BOOKING_DIAL_CODES, checkGuest, checkMomo, PAY_METHODS, type GuestErrors, type PayMethod } from '@/lib/booking-form';
import { accraClock, addDays, formatDayMonth, formatShortDate, nightsBetween, todayInAccra, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import type { SiteImage as SiteImageT } from '@/server/content/site-data';
import type { PromoCode, RateRule, VariantCode } from '@/server/services/pricing';
import { lineAmount, quoteStay } from '@/server/services/quote';
import { SiteImage } from '../site/site-image';
import { Turnstile } from '../site/turnstile';
import { openPaystackPopup, PaySheet, type SheetState } from './pay-sheet';
import { Receipt, ReceiptTotal } from './receipt';

export type BookRoom = {
  code: string;
  name: string;
  beds: string;
  sleeps: number;
  image: SiteImageT;
  variants: { code: VariantCode; name: string; price: number }[];
};

export type BookFlowProps = {
  rooms: BookRoom[];
  rules: RateRule[];
  fees: { breakfastPerGuestNight: number; roomService: number };
  depositPercent: number;
  payAtHotel: boolean;
  freeHours: number;
  contact: { phone: string; tel: string; wa: string };
  turnstileSiteKey: string | null;
  initial: { ci?: string; co?: string; guests?: number; room?: string; tier?: number; bf?: boolean; rs?: boolean };
};

type Plan = 'full' | 'deposit' | 'at_hotel';
const mono = 'var(--font-mono)';
const card: React.CSSProperties = { background: '#FFFFFF', border: '1px solid rgba(0,0,99,0.14)', borderRadius: 20, padding: 20 };
const eyebrow: React.CSSProperties = { fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(0,0,58,0.6)' };
const field = (bad?: boolean): React.CSSProperties => ({
  height: 48,
  padding: '0 14px',
  borderRadius: 10,
  border: `1.5px solid ${bad ? '#B42318' : 'rgba(0,0,58,0.5)'}`,
  background: '#F5F2EA',
  fontSize: 16,
  color: '#00003A',
});
const smallBtn: React.CSSProperties = {
  width: 'max(32px, var(--tap-min, 0px))',
  height: 'max(32px, var(--tap-min, 0px))',
  borderRadius: 8,
  border: '1px solid rgba(0,0,99,0.25)',
  background: '#FFFFFF',
};
const chipSel = (on: boolean) => ({ border: `1.5px solid ${on ? '#000063' : 'rgba(0,0,99,0.2)'}`, background: on ? '#F6E2B3' : '#FFFFFF' });
const ghs0 = (p: number) => formatGhs(p);
const long = (d: IsoDate) => formatShortDate(d);
const monthLabel = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayAria = (key: IsoDate) =>
  new Date(`${key}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });

function Steps({ step }: { step: number }) {
  const items: [string, AnyIconName][] = [
    ['Dates & room', 'calendar'],
    ['Your details', 'user'],
    ['Pay', 'card'],
  ];
  return (
    <ol
      aria-label="Booking steps"
      style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 6, flexWrap: 'wrap', flexShrink: 0, maxWidth: '100%' }}
    >
      {items.map(([label, icon], i) => {
        const n = i + 1;
        const now = n === step;
        const done = n < step;
        return (
          <li
            key={label}
            aria-current={now ? 'step' : undefined}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              height: 34,
              padding: '0 12px',
              whiteSpace: 'nowrap',
              flexShrink: 0,
              borderRadius: 999,
              border: `1px solid ${now ? '#000063' : 'rgba(0,0,99,0.2)'}`,
              background: now ? '#000063' : done ? '#F6E2B3' : 'transparent',
              color: now ? '#F5F2EA' : '#00003A',
              fontSize: 13,
            }}
          >
            <Icon name={icon} size={15} />
            {label}
          </li>
        );
      })}
    </ol>
  );
}

function FieldLabel({ icon, children }: { icon: AnyIconName; children: React.ReactNode }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={16} />
      {children}
    </span>
  );
}

function Err({ id, text }: { id?: string; text?: string | null }) {
  if (!text) return null;
  return (
    <span id={id} role="alert" style={{ color: '#B42318', fontSize: 12 }}>
      {text}
    </span>
  );
}

export function BookFlow(p: BookFlowProps) {
  const router = useRouter();
  const today = useMemo(() => todayInAccra(), []);
  const init = p.initial;
  const validInitCi = init.ci && init.ci >= today ? init.ci : today;
  const [ci, setCi] = useState<IsoDate>(validInitCi);
  const [co, setCo] = useState<IsoDate>(init.co && init.co > validInitCi ? init.co : addDays(validInitCi, 2));
  const [guests, setGuests] = useState(Math.min(4, Math.max(1, init.guests ?? 2)));
  const [sel, setSel] = useState<string | null>(() => {
    const r = p.rooms.find((x) => x.code === init.room);
    return r ? `${r.code}:${Math.min(init.tier ?? 0, r.variants.length - 1)}` : null;
  });
  const [bf, setBf] = useState(!!init.bf);
  const [rs, setRs] = useState(!!init.rs);
  // Open the calendar on the check-in month (dates can arrive from a room page or a link).
  const [calOffset, setCalOffset] = useState(() => {
    const [y0, m0] = today.split('-').map(Number);
    const [y1, m1] = validInitCi.split('-').map(Number);
    return Math.max(0, Math.min(11, (y1! - y0!) * 12 + (m1! - m0!)));
  });
  const [pickEnd, setPickEnd] = useState(false);
  const [step, setStep] = useState(1);
  const [hold, setHold] = useState<{ token: string; expiresAt: number } | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [turnstile, setTurnstile] = useState<string | null>(null);
  const [avail, setAvail] = useState<{ key: string; free: Record<string, number>; soldOut: Set<string>; at: string } | null>(null);
  const [gf, setGf] = useState({ name: '', dialCode: '+233', phone: '', email: '', arrival: 'Not sure yet', notes: '' });
  const [ge, setGe] = useState<GuestErrors>({});
  const [plan, setPlan] = useState<Plan>('deposit');
  // Until Paystack keys are set on the Worker, only "Pay at the hotel" is offered.
  const [onlineOn, setOnlineOn] = useState(true);
  useEffect(() => {
    let live = true;
    void onlinePaymentOn()
      .then((on) => {
        if (!live || on) return;
        setOnlineOn(false);
        setPlan('at_hotel');
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  const [method, setMethod] = useState<PayMethod>('mtn');
  const [momo, setMomo] = useState('');
  const [momoErr, setMomoErr] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [promoInput, setPromoInput] = useState('');
  const [promo, setPromo] = useState<PromoCode | null>(null);
  const [promoErr, setPromoErr] = useState<string | null>(null);
  const [sheet, setSheet] = useState<(SheetState & { payRef: string; method: 'momo' | 'card' }) | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  const nights = Math.max(0, nightsBetween(ci, co));
  const [selCode, selIdx] = sel ? [sel.split(':')[0]!, Number(sel.split(':')[1])] : [null, 0];
  const selRoom = p.rooms.find((r) => r.code === selCode) ?? null;
  const selVariant = selRoom?.variants[selIdx] ?? null;
  const availKey = `${ci}|${co}|${calOffset}`;
  const loading = !avail || avail.key !== availKey;
  const freeOf = (v: string) => (loading ? 0 : (avail!.free[v] ?? 0));
  const selAvail = selVariant ? freeOf(selVariant.code) : 0;
  const validSel = !!selRoom && !loading && selAvail > 0 && guests <= selRoom.sleeps && nights > 0;

  // Live availability for the dates and the months on screen.
  const monthStart = useMemo(() => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + calOffset);
    return d.toISOString().slice(0, 10);
  }, [today, calOffset]);
  useEffect(() => {
    if (nightsBetween(ci, co) < 1) return;
    let live = true;
    const t = setTimeout(() => {
      bookingAvailability(ci, co, monthStart).then((r) => {
        if (!live) return;
        if (r.ok) setAvail({ key: `${ci}|${co}|${calOffset}`, free: r.free, soldOut: new Set(r.soldOut), at: accraClock() });
        else notify(r.error);
      });
    }, 180);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [ci, co, calOffset, monthStart]);

  // One clock for the hold countdown.
  useEffect(() => {
    if (!hold) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hold]);
  const holdMs = hold ? hold.expiresAt - nowMs : 0;
  const holdExpired = step >= 2 && !!hold && holdMs <= 0;
  const holdLeft =
    holdMs > 0
      ? `${String(Math.floor(holdMs / 60000)).padStart(2, '0')}:${String(Math.floor(holdMs / 1000) % 60).padStart(2, '0')}`
      : '00:00';

  const q = useMemo(
    () =>
      selVariant && nights
        ? quoteStay({
            variant: selVariant,
            checkIn: ci,
            checkOut: co,
            guests,
            breakfast: bf,
            roomService: rs,
            rules: p.rules,
            fees: p.fees,
            depositPercent: p.depositPercent,
            promo,
            today,
          })
        : null,
    [selVariant, nights, ci, co, guests, bf, rs, p.rules, p.fees, p.depositPercent, promo, today],
  );
  const total = q?.total ?? 0;
  const deposit = q?.deposit ?? 0;
  const dueNow = plan === 'full' ? total : plan === 'deposit' ? deposit : 0;
  const promoOk = q?.promo?.ok ? q.promo : null;

  const scrollTop = () => {
    topRef.current?.scrollIntoView({ block: 'start' });
    window.scrollTo(0, 0);
  };

  /* ── calendar ── */
  const calMonths = Array.from({ length: 2 }, (_, k) => {
    const first = new Date(`${monthStart}T00:00:00Z`);
    first.setUTCMonth(first.getUTCMonth() + k);
    const y = first.getUTCFullYear();
    const mo = first.getUTCMonth();
    const lead = (first.getUTCDay() + 6) % 7;
    const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return {
      label: monthLabel(y, mo),
      lead,
      days: Array.from({ length: dim }, (_, i) => new Date(Date.UTC(y, mo, i + 1)).toISOString().slice(0, 10)),
    };
  });
  const isSold = (d: IsoDate) => !!avail?.soldOut.has(d);
  const pickDay = (key: IsoDate) => {
    if (!pickEnd || key <= ci) {
      setCi(key);
      setCo(addDays(key, 1));
      setPickEnd(true);
      return;
    }
    for (let d = addDays(ci, 1); d < key; d = addDays(d, 1)) {
      if (isSold(d)) {
        notify('A fully booked night sits in between.', 'Pick dates on one side of it, or call us.');
        return;
      }
    }
    setCo(key);
    setPickEnd(false);
  };

  /* ── steps ── */
  const goStep2 = async () => {
    if (!validSel || !selVariant) return;
    if (hold && hold.expiresAt > Date.now()) {
      setStep(2);
      scrollTop();
      return;
    }
    setBusy(true);
    const r = await holdRoom({ variant: selVariant.code, checkIn: ci, checkOut: co, guests, turnstile });
    setBusy(false);
    if (!r.ok) {
      notify(r.error);
      if (r.soldOut) setAvail(null);
      return;
    }
    setHold({ token: r.token, expiresAt: Date.now() + r.expiresIn });
    setNowMs(Date.now());
    setStep(2);
    scrollTop();
  };

  const renewHold = async () => {
    if (!selVariant) return;
    setBusy(true);
    const r = await holdRoom({ variant: selVariant.code, checkIn: ci, checkOut: co, guests, turnstile });
    setBusy(false);
    if (!r.ok) {
      notify(r.error);
      setHold(null);
      setStep(1);
      setAvail(null);
      return;
    }
    setHold({ token: r.token, expiresAt: Date.now() + r.expiresIn });
    setNowMs(Date.now());
  };

  const back = () => {
    setFailed(null);
    if (step === 2 && hold) {
      void releaseRoom(hold.token);
      setHold(null);
    }
    setStep(step - 1);
    scrollTop();
  };

  const goStep3 = () => {
    const r = checkGuest(gf);
    if (!r.ok) {
      setGe(r.errors);
      return;
    }
    if (!momo) setMomo(gf.dialCode === '+233' ? gf.phone : '');
    setStep(3);
    scrollTop();
  };

  const pollPayment = useCallback(
    (payRef: string, kind: 'momo' | 'card') => {
      let tries = 0;
      const tick = async () => {
        tries++;
        const s = await paymentState(payRef, kind);
        if (s.state === 'confirmed') {
          router.push(s.href);
          return;
        }
        if (s.state === 'failed' || s.state === 'refunded') {
          setSheet(null);
          setFailed(s.error);
          return;
        }
        if (tries < 60) setTimeout(tick, tries < 10 ? 3000 : 5000);
        else {
          setSheet(null);
          setFailed('The prompt was declined or timed out.');
        }
      };
      setTimeout(tick, 3000);
    },
    [router],
  );

  const pay = async () => {
    if (!hold) return;
    const isMomo = method !== 'card';
    if (plan !== 'at_hotel' && isMomo) {
      const m = checkMomo(momo);
      if (!m.ok) {
        setMomoErr(m.error);
        return;
      }
    }
    setBusy(true);
    setFailed(null);
    setFormErr(null);
    const r = await submitBooking({
      token: hold.token,
      guests,
      guest: gf,
      breakfast: bf,
      roomService: rs,
      promo: promoOk ? promoOk.code : null,
      plan,
      method,
      momo,
    });
    setBusy(false);
    if (!r.ok) {
      if (r.errors) {
        setGe(r.errors);
        setStep(2);
        scrollTop();
      } else if (r.field === 'momo') setMomoErr(r.error);
      else if (r.field === 'promo') {
        setPromo(null);
        setPromoErr(r.error);
      } else if (r.holdExpired) setHold((h) => (h ? { ...h, expiresAt: Date.now() - 1 } : h));
      else if (r.failed) setFailed(r.error);
      else setFormErr(r.error);
      return;
    }
    if (r.kind === 'confirmed') {
      router.push(`/book/confirmation/${r.token}`);
      return;
    }
    if (r.kind === 'momo') {
      setSheet({ stage: r.stage, display: r.display, payRef: r.payRef, method: 'momo' });
      if (r.stage === 'prompt') pollPayment(r.payRef, 'momo');
      return;
    }
    setSheet({ stage: 'card', payRef: r.payRef, method: 'card' });
    try {
      const out = await openPaystackPopup(r.accessCode);
      if (out === 'success') {
        setSheet({ stage: 'confirming', payRef: r.payRef, method: 'card' });
        pollPayment(r.payRef, 'card');
      } else setSheet(null);
    } catch {
      setSheet(null);
      setFailed('Paystack couldn’t open. Check your connection and try again.');
    }
  };

  const next = () => {
    if (step === 1) void goStep2();
    else if (step === 2) goStep3();
    else void pay();
  };

  const applyPromo = async () => {
    if (!selVariant || !nights) {
      setPromoErr('Pick a room and dates first.');
      return;
    }
    const r = await lookupPromo(promoInput);
    if (!r.ok) {
      setPromoErr(r.error);
      return;
    }
    const check = quoteStay({
      variant: selVariant,
      checkIn: ci,
      checkOut: co,
      guests,
      breakfast: true,
      roomService: rs,
      rules: p.rules,
      fees: p.fees,
      depositPercent: p.depositPercent,
      promo: r.promo,
      today,
    }).promo;
    if (!check || !check.ok) {
      setPromoErr(check && !check.ok ? check.error : 'That code isn’t valid for this room.');
      return;
    }
    setPromo(r.promo);
    setPromoErr(null);
    setPromoInput('');
    if (check.freeBreakfast) setBf(true);
    notify('Code applied.', check.label);
  };

  /* ── derived view ── */
  const roomOpts = p.rooms.flatMap((r) =>
    r.variants.map((v, i) => {
      const a = freeOf(v.code);
      const tooMany = guests > r.sleeps;
      const badge = tooMany ? `Sleeps ${r.sleeps}` : a === 0 ? 'Sold out these dates' : a === 1 ? 'Last one' : `${a} left`;
      const tone = tooMany || a === 0 ? ['#EFE9E6', '#B42318'] : a === 1 ? ['#F2B544', '#00003A'] : ['#F6E2B3', '#000063'];
      return { key: `${r.code}:${i}`, room: r, variant: v, a, tooMany, badge, tone, disabled: a === 0 || tooMany };
    }),
  );
  const allSoldOut = !loading && roomOpts.every((o) => o.disabled && !o.tooMany);
  const altDates = [7, 10, 14].map((n) => {
    const a = addDays(today, n);
    return { label: `${formatDayMonth(a)} → ${formatDayMonth(addDays(a, nights || 1))}`, ci: a, co: addDays(a, nights || 1) };
  });
  const receipt = q ? q.lines.map((l) => ({ label: l.label, amount: lineAmount(l) })) : [{ label: 'PICK A ROOM', amount: '—' }];
  const nextDisabled = (step === 1 && !validSel) || holdExpired || busy;
  const nextLabel =
    step === 1
      ? validSel
        ? `Continue · ${ghs0(total)}`
        : selRoom && !loading && selAvail === 0
          ? 'Room not available'
          : 'Choose a room'
      : step === 2
        ? 'Continue to payment'
        : plan === 'at_hotel'
          ? 'Confirm booking'
          : `Pay ${ghs0(dueNow)}`;
  const isMomo = PAY_METHODS.find((m) => m.id === method)!.momo;
  const momoLabel = PAY_METHODS.find((m) => m.id === method)!.label;
  const rangeShort = `${formatDayMonth(ci)} – ${formatDayMonth(co)}`;
  const rangeLong = `${long(ci)} → ${long(co)} · ${nights} night${nights === 1 ? '' : 's'}`;
  const plans: [Plan, string, string, string, AnyIconName][] = [
    ...(onlineOn
      ? ([
          ['full', 'Pay in full', 'Done and dusted. Nothing to pay at the desk.', ghs0(total), 'wallet'],
          ['deposit', `Pay a ${p.depositPercent}% deposit`, 'The rest at check-in, cash or MoMo.', ghs0(deposit), 'cash'],
        ] as [Plan, string, string, string, AnyIconName][])
      : []),
    ...(p.payAtHotel || !onlineOn
      ? ([['at_hotel', 'Pay at the hotel', 'We hold the room. Pay when you arrive.', 'GHS 0', 'building']] as [
          Plan,
          string,
          string,
          string,
          AnyIconName,
        ][])
      : []),
  ];

  return (
    <div ref={topRef} style={{ scrollMarginTop: 96 }}>
      <div
        data-screen-label="Booking · Step header"
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}
      >
        <Steps step={step} />
        {step >= 2 && hold && !holdExpired && (
          <div
            role="timer"
            aria-live="off"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              height: 34,
              padding: '0 12px',
              borderRadius: 999,
              background: '#00003A',
              color: '#F5F2EA',
              fontSize: 13,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#F2B544',
                flexShrink: 0,
                animation: 'aw-breathe 2.8s ease-in-out infinite',
              }}
            />
            <span>Room held for you</span>
            <span style={{ fontFamily: mono, color: '#F2B544' }}>{holdLeft}</span>
          </div>
        )}
      </div>

      {holdExpired && (
        <div
          role="alert"
          style={{
            marginBottom: 24,
            padding: '18px 20px',
            borderRadius: 10,
            background: '#FFFFFF',
            border: '1.5px solid #B42318',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <strong style={{ fontWeight: 500 }}>Your 15-minute hold ran out.</strong>
            <span style={{ fontSize: 14, color: 'rgba(0,0,58,0.7)' }}>
              We released the room so nobody gets double-booked. It may still be free. Check again and we&apos;ll hold it for another 15.
            </span>
          </div>
          <button
            type="button"
            onClick={renewHold}
            disabled={busy}
            data-mi-btn="fill"
            style={{
              height: 44,
              padding: '0 18px',
              border: 'none',
              borderRadius: 10,
              background: '#000063',
              color: '#F5F2EA',
              fontSize: 14,
            }}
          >
            Check again
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c-main)', gap: 40, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32, minWidth: 0 }}>
          {step === 1 && (
            <section
              data-screen-label="Booking · 1 Dates & room"
              style={{ display: 'flex', flexDirection: 'column', gap: 28, animation: 'aw-up 300ms var(--ease-enter)' }}
            >
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
                When are you <em style={{ fontWeight: 300 }}>coming?</em>
              </h1>
              <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={eyebrow}>CHECK-IN</span>
                      <span style={{ fontSize: 17 }}>{long(ci)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={eyebrow}>CHECK-OUT</span>
                      <span style={{ fontSize: 17 }}>{long(co)}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={eyebrow}>GUESTS</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button type="button" aria-label="Fewer guests" onClick={() => setGuests(Math.max(1, guests - 1))} style={smallBtn}>
                          −
                        </button>
                        <span aria-live="polite" style={{ fontFamily: mono, fontSize: 16 }}>
                          {guests}
                        </span>
                        <button type="button" aria-label="More guests" onClick={() => setGuests(Math.min(4, guests + 1))} style={smallBtn}>
                          +
                        </button>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[
                      ['Previous month', '←', () => setCalOffset(Math.max(0, calOffset - 1)), calOffset === 0],
                      ['Next month', '→', () => setCalOffset(calOffset + 1), calOffset >= 11],
                    ].map(([label, glyph, on, dis]) => (
                      <button
                        key={label as string}
                        type="button"
                        aria-label={label as string}
                        onClick={on as () => void}
                        disabled={dis as boolean}
                        style={{
                          width: 'max(40px, var(--tap-min, 0px))',
                          height: 'max(40px, var(--tap-min, 0px))',
                          borderRadius: 10,
                          border: '1px solid rgba(0,0,99,0.2)',
                          background: '#FFFFFF',
                          opacity: dis ? 0.4 : 1,
                        }}
                      >
                        {glyph as string}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'var(--c-cal)', gap: 28 }}>
                  {calMonths.map((mo, k) => (
                    <div
                      key={mo.label}
                      className={k === 1 ? 'aw-cal-second' : undefined}
                      style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
                    >
                      <span style={{ fontFamily: 'var(--font-serif)', fontSize: 20 }}>{mo.label}</span>
                      <div
                        role="group"
                        aria-label={mo.label}
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(7,minmax(0,1fr))', rowGap: 2 }}
                      >
                        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((w, i) => (
                          <span
                            key={i}
                            aria-hidden="true"
                            style={{ textAlign: 'center', fontFamily: mono, fontSize: 11, color: 'rgba(0,0,58,0.5)', padding: '4px 0' }}
                          >
                            {w}
                          </span>
                        ))}
                        {Array.from({ length: mo.lead }, (_, i) => (
                          <span key={`l${i}`} />
                        ))}
                        {mo.days.map((key) => {
                          const past = key < today;
                          const sold = !past && isSold(key);
                          const isStart = key === ci;
                          const isEnd = key === co;
                          const inRange = key > ci && key < co;
                          const disabled = past || (sold && !isEnd);
                          return (
                            <button
                              key={key}
                              type="button"
                              disabled={disabled}
                              onClick={() => pickDay(key)}
                              aria-label={`${dayAria(key)}${sold ? ', fully booked' : ''}${past ? ', past' : ''}`}
                              aria-pressed={isStart || isEnd}
                              className="aw-press"
                              style={{
                                height: 'max(42px, var(--tap-min, 0px))',
                                border: 'none',
                                borderRadius: isStart ? '8px 0 0 8px' : isEnd ? '0 8px 8px 0' : inRange ? 0 : 8,
                                background: isStart || isEnd ? '#000063' : inRange ? '#F6E2B3' : 'transparent',
                                color: isStart || isEnd ? '#F5F2EA' : past ? 'rgba(0,0,58,0.25)' : sold ? 'rgba(0,0,58,0.35)' : '#00003A',
                                textDecoration: sold && !past ? 'line-through' : 'none',
                                fontFamily: mono,
                                fontSize: 13,
                                boxShadow: key === today && !isStart ? 'inset 0 0 0 1.5px #F2B544' : 'none',
                              }}
                            >
                              {Number(key.slice(8))}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: 12, color: 'rgba(0,0,58,0.65)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: '#000063' }} />
                    Your stay
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontFamily: mono, textDecoration: 'line-through' }}>14</span>Fully booked
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, boxShadow: 'inset 0 0 0 1.5px #F2B544' }} />
                    Today
                  </span>
                  <span style={{ marginLeft: 'auto' }}>
                    {pickEnd ? 'Now pick your check-out' : `${nights} night${nights === 1 ? '' : 's'} · tap a date to change`}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 28 }}>Rooms for {rangeShort}</h2>
                  {avail && <span style={{ fontFamily: mono, fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>Live · updated {avail.at}</span>}
                </div>
                {loading ? (
                  <div aria-busy="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[1, 2, 3, 4].map((x) => (
                      <div
                        key={x}
                        style={{ height: 112, borderRadius: 12, background: '#F6E2B3', animation: 'aw-shimmer 1.4s ease-in-out infinite' }}
                      />
                    ))}
                    <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.6)' }}>Checking which keys are on the hook…</span>
                  </div>
                ) : allSoldOut ? (
                  <div
                    style={{
                      padding: 28,
                      borderRadius: 20,
                      background: '#00003A',
                      color: '#F5F2EA',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 14,
                    }}
                  >
                    <span style={{ fontFamily: mono, fontSize: 12, color: '#F2B544' }}>SOLD OUT · {rangeShort}</span>
                    <p style={{ margin: 0, fontFamily: 'var(--font-serif)', fontSize: 30, lineHeight: 1.1 }}>
                      Every key&apos;s on someone else&apos;s hook those nights. Sorry.
                    </p>
                    <span style={{ fontSize: 14, opacity: 0.75 }}>The nearest nights with rooms free:</span>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {altDates.map((a) => (
                        <button
                          key={a.ci}
                          type="button"
                          onClick={() => {
                            setCi(a.ci);
                            setCo(a.co);
                            setPickEnd(false);
                          }}
                          style={{
                            height: 'max(40px, var(--tap-min, 0px))',
                            padding: '0 14px',
                            borderRadius: 10,
                            border: '1px solid rgba(245,242,234,0.35)',
                            background: 'transparent',
                            color: '#F5F2EA',
                            fontFamily: mono,
                            fontSize: 13,
                          }}
                        >
                          {a.label}
                        </button>
                      ))}
                    </div>
                    <span style={{ fontSize: 13, opacity: 0.75 }}>
                      Or call{' '}
                      <a href={p.contact.tel} style={{ color: '#F5F2EA' }}>
                        {p.contact.phone}
                      </a>
                      . Cancellations happen, and the desk knows first.
                    </span>
                  </div>
                ) : (
                  <div role="radiogroup" aria-label="Choose a room" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {roomOpts.map((o) => {
                      const on = sel === o.key;
                      return (
                        <button
                          key={o.key}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          disabled={o.disabled}
                          onClick={() => setSel(o.key)}
                          className="aw-press"
                          style={{
                            display: 'grid',
                            gridTemplateColumns: 'var(--c-row)',
                            gap: 16,
                            alignItems: 'center',
                            padding: 12,
                            borderRadius: 20,
                            border: `1.5px solid ${on ? '#000063' : 'rgba(0,0,99,0.16)'}`,
                            background: '#FFFFFF',
                            textAlign: 'left',
                            color: '#00003A',
                            opacity: o.disabled ? 0.55 : 1,
                          }}
                        >
                          <div style={{ position: 'relative', height: 88, borderRadius: 16, overflow: 'hidden', background: '#F6E2B3' }}>
                            <SiteImage
                              image={o.room.image}
                              alt=""
                              fill
                              sizes="120px"
                              style={{ objectFit: 'cover', filter: 'saturate(0.92)' }}
                            />
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                              <span
                                style={{
                                  fontFamily: mono,
                                  fontSize: 13,
                                  padding: '2px 8px',
                                  borderRadius: 5,
                                  background: '#000063',
                                  color: '#F5F2EA',
                                }}
                              >
                                {o.room.code}
                              </span>
                              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 21 }}>{o.variant.name}</span>
                            </div>
                            <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.65)' }}>
                              {o.room.beds} · up to {o.room.sleeps} guests
                            </span>
                            <span
                              style={{
                                fontFamily: mono,
                                fontSize: 11,
                                alignSelf: 'flex-start',
                                padding: '3px 8px',
                                borderRadius: 999,
                                background: o.tone[0],
                                color: o.tone[1],
                              }}
                            >
                              {o.badge}
                            </span>
                          </div>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'flex-end',
                              gap: 4,
                              fontFamily: mono,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            <span style={{ fontSize: 17, fontWeight: 500 }}>{ghs0(o.variant.price)}</span>
                            <span style={{ fontSize: 11, color: 'rgba(0,0,58,0.55)' }}>per night</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <Turnstile siteKey={p.turnstileSiteKey} onToken={setTurnstile} />
            </section>
          )}

          {step === 2 && (
            <section
              data-screen-label="Booking · 2 Guest details"
              style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'aw-up 300ms var(--ease-enter)' }}
            >
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
                Who&apos;s <em style={{ fontWeight: 300 }}>checking in?</em>
              </h1>
              <p style={{ margin: 0, fontSize: 15, color: 'rgba(0,0,58,0.7)' }}>
                No account needed. We&apos;ll text your receipt, and email it too if you give us an address.
              </p>
              <div style={{ ...card, display: 'grid', gridTemplateColumns: 'var(--c2)', gap: 16 }}>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <FieldLabel icon="user">Full name</FieldLabel>
                  <input
                    value={gf.name}
                    onChange={(e) => {
                      setGf({ ...gf, name: e.target.value });
                      setGe({ ...ge, name: undefined });
                    }}
                    placeholder="e.g. Kofi Mensah"
                    autoComplete="name"
                    maxLength={120}
                    aria-invalid={!!ge.name}
                    aria-describedby={ge.name ? 'bk-name-err' : undefined}
                    style={field(!!ge.name)}
                  />
                  <Err id="bk-name-err" text={ge.name} />
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <label htmlFor="bk-phone">
                    <FieldLabel icon="smartphone">Phone (for SMS)</FieldLabel>
                  </label>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <Select
                      variant="field"
                      mono
                      width={128}
                      panelWidth={200}
                      ariaLabel="Country code"
                      value={gf.dialCode}
                      options={BOOKING_DIAL_CODES}
                      onChange={(v) => setGf({ ...gf, dialCode: v })}
                    />
                    <input
                      id="bk-phone"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel-national"
                      enterKeyHint="next"
                      value={gf.phone}
                      onChange={(e) => {
                        setGf({ ...gf, phone: e.target.value });
                        setGe({ ...ge, phone: undefined });
                      }}
                      placeholder="055 555 7090"
                      aria-invalid={!!ge.phone}
                      aria-describedby={ge.phone ? 'bk-phone-err' : undefined}
                      style={{ ...field(!!ge.phone), flex: 1, minWidth: 0, fontFamily: mono }}
                    />
                  </div>
                  <Err id="bk-phone-err" text={ge.phone} />
                </div>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <FieldLabel icon="mail">Email (optional)</FieldLabel>
                  <input
                    value={gf.email}
                    onChange={(e) => {
                      setGf({ ...gf, email: e.target.value });
                      setGe({ ...ge, email: undefined });
                    }}
                    placeholder="you@example.com"
                    type="email"
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    aria-invalid={!!ge.email}
                    aria-describedby={ge.email ? 'bk-email-err' : undefined}
                    style={field(!!ge.email)}
                  />
                  <Err id="bk-email-err" text={ge.email} />
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <FieldLabel icon="clock">Arrival time (any hour, we&apos;re up)</FieldLabel>
                  <Select
                    variant="field"
                    mono
                    ariaLabel="Arrival time"
                    label="Arrival time"
                    value={gf.arrival}
                    options={ARRIVALS}
                    onChange={(v) => setGf({ ...gf, arrival: v })}
                  />
                </div>
                <label style={{ gridColumn: '1 / -1', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  Special requests (optional)
                  <textarea
                    value={gf.notes}
                    onChange={(e) => setGf({ ...gf, notes: e.target.value })}
                    rows={3}
                    maxLength={1000}
                    placeholder="Late arrival, extra pillows, a quiet room at the end of the hall…"
                    style={{ ...field(), height: 'auto', padding: '12px 14px', resize: 'vertical', fontFamily: 'inherit' }}
                  />
                </label>
              </div>
            </section>
          )}

          {step === 3 && (
            <section
              data-screen-label="Booking · 3 Pay"
              style={{ display: 'flex', flexDirection: 'column', gap: 24, animation: 'aw-up 300ms var(--ease-enter)' }}
            >
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
                Settle up, <em style={{ fontWeight: 300 }}>however suits.</em>
              </h1>
              {failed && (
                <div
                  role="alert"
                  style={{
                    padding: '18px 20px',
                    borderRadius: 10,
                    background: '#FFFFFF',
                    border: '1.5px solid #B42318',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    animation: 'aw-pop 240ms var(--ease-enter)',
                  }}
                >
                  <strong style={{ fontWeight: 500, color: '#B42318' }}>Payment didn&apos;t go through.</strong>
                  <span style={{ fontSize: 14, color: 'rgba(0,0,58,0.75)' }}>
                    {failed} Nothing was taken from your account. Your room is still held for{' '}
                    <span style={{ fontFamily: mono }}>{holdLeft}</span>.
                  </span>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => void pay()}
                      data-mi-btn="fill"
                      style={{
                        height: 'max(42px, var(--tap-min, 0px))',
                        padding: '0 16px',
                        border: 'none',
                        borderRadius: 10,
                        background: '#000063',
                        color: '#F5F2EA',
                        fontSize: 14,
                      }}
                    >
                      Try again
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMethod('card');
                        setFailed(null);
                      }}
                      data-mi-btn="ghost"
                      style={{
                        height: 'max(42px, var(--tap-min, 0px))',
                        padding: '0 16px',
                        borderRadius: 10,
                        border: '1px solid #000063',
                        background: 'transparent',
                        fontSize: 14,
                      }}
                    >
                      Use a card instead
                    </button>
                    <a
                      href={p.contact.tel}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        height: 'max(42px, var(--tap-min, 0px))',
                        padding: '0 4px',
                        fontSize: 14,
                      }}
                    >
                      Call the desk
                    </a>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label htmlFor="aw-promo" style={eyebrow}>
                  PROMO CODE (OPTIONAL)
                </label>
                {promoOk ? (
                  <div
                    role="status"
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '8px 8px 8px 14px',
                      borderRadius: 10,
                      background: '#E5F2EA',
                      color: '#1F7A4D',
                      fontSize: 14,
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <Icon name="check" size={16} style={{ flexShrink: 0 }} />
                      <span>
                        <strong style={{ fontFamily: mono, fontWeight: 500 }}>{promoOk.code}</strong> · {promoOk.label}
                        {promoOk.freeBreakfast && !bf
                          ? ' (tick breakfast to use it)'
                          : q?.discount
                            ? ` · you save ${ghs0(q.discount)}`
                            : ''}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPromo(null);
                        setPromoErr(null);
                      }}
                      style={{
                        height: 36,
                        padding: '0 12px',
                        border: 'none',
                        borderRadius: 8,
                        background: 'transparent',
                        color: '#1F7A4D',
                        fontSize: 13,
                        textDecoration: 'underline',
                        textUnderlineOffset: 3,
                      }}
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        id="aw-promo"
                        value={promoInput}
                        onChange={(e) => {
                          setPromoInput(e.target.value.toUpperCase().replace(/\s+/g, ''));
                          setPromoErr(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void applyPromo();
                          }
                        }}
                        placeholder="e.g. AWISE3"
                        autoComplete="off"
                        autoCapitalize="characters"
                        spellCheck={false}
                        maxLength={32}
                        aria-invalid={!!promoErr}
                        aria-describedby="aw-promo-err"
                        style={{ ...field(!!promoErr), flex: 1, minWidth: 0, background: '#FFFFFF', fontFamily: mono }}
                      />
                      <button
                        type="button"
                        onClick={() => void applyPromo()}
                        data-mi-btn="ghost"
                        style={{
                          height: 48,
                          padding: '0 18px',
                          borderRadius: 10,
                          border: '1px solid #000063',
                          background: 'transparent',
                          color: '#000063',
                          fontSize: 14,
                          fontWeight: 500,
                        }}
                      >
                        Apply
                      </button>
                    </div>
                    {promoErr && (
                      <span
                        id="aw-promo-err"
                        role="alert"
                        style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#B42318' }}
                      >
                        <Icon name="alert" size={14} />
                        {promoErr}
                      </span>
                    )}
                  </>
                )}
              </div>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <legend style={{ ...eyebrow, marginBottom: 10 }}>HOW MUCH NOW</legend>
                <div role="radiogroup" aria-label="How much now" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {plans.map(([id, label, note, amt, icon]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={plan === id}
                      onClick={() => {
                        setPlan(id);
                        setFailed(null);
                      }}
                      className="aw-press"
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 16,
                        minHeight: 64,
                        padding: '12px 16px',
                        borderRadius: 10,
                        ...chipSel(plan === id),
                        textAlign: 'left',
                        color: '#00003A',
                      }}
                    >
                      <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <span
                          style={{
                            width: 40,
                            height: 40,
                            borderRadius: 12,
                            background: '#F6E2B3',
                            color: '#000063',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                          }}
                        >
                          <Icon name={icon} size={20} />
                        </span>
                        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <span style={{ fontSize: 15, fontWeight: 500 }}>{label}</span>
                          <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.65)' }}>{note}</span>
                        </span>
                      </span>
                      <span style={{ fontFamily: mono, fontSize: 15 }}>{amt}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              {plan !== 'at_hotel' && (
                <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <legend style={{ ...eyebrow, marginBottom: 10 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="lock" size={13} />
                      PAY WITH · SECURED BY PAYSTACK
                    </span>
                  </legend>
                  <div role="radiogroup" aria-label="Pay with" style={{ display: 'grid', gridTemplateColumns: 'var(--c4m)', gap: 8 }}>
                    {PAY_METHODS.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        role="radio"
                        aria-checked={method === m.id}
                        onClick={() => {
                          setMethod(m.id);
                          setMomoErr(null);
                        }}
                        className="aw-press"
                        style={{
                          minHeight: 72,
                          padding: 12,
                          borderRadius: 10,
                          ...chipSel(method === m.id),
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          justifyContent: 'space-between',
                          gap: 6,
                          textAlign: 'left',
                          color: '#00003A',
                        }}
                      >
                        <span style={{ display: 'flex', gap: 6, alignItems: 'center', height: 30 }}>
                          {m.logos.map((lg) => (
                            <Icon key={lg} name={lg as AnyIconName} size={30} />
                          ))}
                        </span>
                        <span style={{ fontSize: 14, fontWeight: 500 }}>{m.label}</span>
                      </button>
                    ))}
                  </div>
                  {isMomo ? (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, maxWidth: 360 }}>
                      <FieldLabel icon="smartphone">{momoLabel} number</FieldLabel>
                      <input
                        type="tel"
                        inputMode="tel"
                        autoComplete="tel-national"
                        enterKeyHint="next"
                        value={momo}
                        onChange={(e) => {
                          setMomo(e.target.value);
                          setMomoErr(null);
                        }}
                        placeholder="024 412 3456"
                        aria-invalid={!!momoErr}
                        style={{ ...field(!!momoErr), background: '#FFFFFF', fontFamily: mono }}
                      />
                      <Err text={momoErr} />
                      <span style={{ fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>
                        You&apos;ll get a prompt on this phone. Approve it with your MoMo PIN.
                      </span>
                    </label>
                  ) : (
                    <p style={{ margin: 0, fontSize: 14, color: 'rgba(0,0,58,0.7)' }}>
                      Visa or Mastercard. You&apos;ll enter card details in Paystack&apos;s secure window. We never see or store them.
                    </p>
                  )}
                </fieldset>
              )}
              {formErr && (
                <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B42318' }}>
                  {formErr}
                </p>
              )}
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'rgba(0,0,58,0.65)', maxWidth: 600 }}>
                Free cancellation up to {p.freeHours} hours before check-in, refunded to the way you paid. Inside {p.freeHours} hours we
                keep the deposit. No-shows are charged the first night.
              </p>
            </section>
          )}
        </div>

        <aside
          aria-label="Booking summary"
          style={{
            position: 'var(--sticky)' as React.CSSProperties['position'],
            top: 88,
            background: '#FFFFFF',
            border: '1px solid rgba(0,0,99,0.14)',
            borderRadius: 20,
            overflow: 'hidden',
          }}
        >
          {selRoom && (
            <div style={{ position: 'relative', height: 140, overflow: 'hidden', background: '#F6E2B3' }}>
              <SiteImage
                image={selRoom.image}
                alt={`${selRoom.name} room`}
                fill
                sizes="380px"
                style={{ objectFit: 'cover', filter: 'saturate(0.92)' }}
              />
            </div>
          )}
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>
                {selVariant ? `${selVariant.name} Room` : 'No room yet'}
              </span>
              <span style={{ fontFamily: mono, fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>{selRoom?.code ?? ''}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 14, color: 'rgba(0,0,58,0.75)' }}>
              <span>{rangeLong}</span>
              <span>
                {guests} guest{guests === 1 ? '' : 's'} · arriving {gf.arrival}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 12, borderTop: '1px solid rgba(0,0,99,0.12)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, minHeight: 32 }}>
                <input
                  type="checkbox"
                  checked={bf}
                  onChange={(e) => setBf(e.target.checked)}
                  disabled={step >= 3}
                  style={{ width: 18, height: 18, accentColor: '#000063' }}
                />
                Breakfast, 7–10am
                <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 12, color: 'rgba(0,0,58,0.62)' }}>
                  {formatGhs(p.fees.breakfastPerGuestNight, { prefix: false })} per guest, per day
                </span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, minHeight: 32 }}>
                <input
                  type="checkbox"
                  checked={rs}
                  onChange={(e) => setRs(e.target.checked)}
                  disabled={step >= 3}
                  style={{ width: 18, height: 18, accentColor: '#000063' }}
                />
                Room service
                <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 12, color: 'rgba(0,0,58,0.62)' }}>
                  + {formatGhs(p.fees.roomService, { prefix: false })}
                </span>
              </label>
            </div>
            <Receipt lines={receipt}>
              <ReceiptTotal label="TOTAL" amount={ghs0(total)} />
              {step === 3 && <ReceiptTotal label="DUE NOW" amount={ghs0(dueNow)} top={false} size={13} color="#000063" />}
            </Receipt>
            <div style={{ display: 'flex', gap: 8 }}>
              {step > 1 && (
                <button
                  type="button"
                  onClick={back}
                  data-mi-btn="ghost"
                  style={{
                    height: 52,
                    padding: '0 16px',
                    borderRadius: 10,
                    border: '1px solid rgba(0,0,99,0.3)',
                    background: 'transparent',
                    fontSize: 14,
                  }}
                >
                  Back
                </button>
              )}
              <button
                type="button"
                onClick={next}
                disabled={nextDisabled}
                data-mi-btn="fill"
                style={{
                  flex: 1,
                  minHeight: 52,
                  border: 'none',
                  borderRadius: 10,
                  background: nextDisabled ? 'rgba(0,0,58,0.08)' : '#000063',
                  color: nextDisabled ? 'rgba(0,0,58,0.45)' : '#F5F2EA',
                  fontWeight: 600,
                  fontSize: 15,
                }}
              >
                {busy ? 'One moment…' : nextLabel}
              </button>
            </div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'rgba(0,0,58,0.6)' }}>
              Prefer to talk? <a href={p.contact.tel}>Call</a> or <a href={p.contact.wa}>WhatsApp</a>{' '}
              <span style={{ fontFamily: mono }}>{p.contact.phone}</span>
            </p>
          </div>
        </aside>
      </div>

      <div aria-hidden="true" className="aw-mobile-bar" style={{ height: 'calc(84px + env(safe-area-inset-bottom))' }} />
      <div
        className="aw-mobile-bar"
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          padding: '12px 16px calc(12px + env(safe-area-inset-bottom))',
          background: '#F5F2EA',
          borderTop: '1px solid rgba(0,0,99,0.16)',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0 }}>
          <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 500 }}>
            {selVariant && nights ? ghs0(step === 3 ? dueNow : total) : 'No room yet'}
          </span>
          <span style={{ fontSize: 12, color: 'rgba(0,0,58,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {selVariant ? `${selVariant.name} · ${nights} night${nights === 1 ? '' : 's'}` : 'Pick dates and a room'}
          </span>
        </div>
        <button
          type="button"
          onClick={next}
          disabled={nextDisabled}
          style={{
            height: 48,
            padding: '0 20px',
            border: 'none',
            borderRadius: 10,
            background: '#000063',
            color: '#F5F2EA',
            fontWeight: 600,
            fontSize: 15,
            opacity: nextDisabled ? 0.45 : 1,
          }}
        >
          {step === 3 ? (plan === 'at_hotel' ? 'Confirm' : 'Pay') : 'Continue'}
        </button>
      </div>

      {sheet && (
        <PaySheet
          state={sheet}
          amount={ghs0(dueNow)}
          onClose={() => setSheet(null)}
          onSubmitOtp={async (code) => {
            const r = await sendMomoCode(sheet.payRef, code);
            if (!r.ok) return r.error;
            setSheet({ stage: 'prompt', display: r.display, payRef: sheet.payRef, method: 'momo' });
            pollPayment(sheet.payRef, 'momo');
            return null;
          }}
        />
      )}
    </div>
  );
}
