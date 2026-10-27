'use client';
// Rentals (Checkout.dc.html › RENTALS CATALOGUE and RENTAL CHECKOUT): pick dates
// and items or packs, then who's collecting, then pay online or at pickup.
// Pickup only (DECISIONS D-01). Stock and prices are re-checked on the server.
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { paymentState, sendMomoCode } from '@/app/(site)/(checkout)/pay-actions';
import { onlinePaymentOn, payForOrder, placeOrder, rentalStock } from '@/app/(site)/(checkout)/rent/actions';
import { DatePicker } from '@/components/ui/date-picker';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { Select } from '@/components/ui/select';
import { notify } from '@/components/ui/toaster';
import { checkMomo, PAY_METHODS, type PayMethod } from '@/lib/booking-form';
import { addDays, formatDayMonth, formatShortDate, todayInAccra } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { checkCollector, OCCASIONS, qtyStep, type CollectorErrors } from '@/lib/rental-form';
import type { SiteImage as SiteImageT } from '@/server/content/site-data';
import { packFits, quoteRental, rentalReceipt, type QuotePack } from '@/server/services/rental-quote';
import { SiteImage } from '../site/site-image';
import { Turnstile } from '../site/turnstile';
import { openPaystackPopup, PaySheet, type SheetState } from './pay-sheet';
import { setRent, useRent } from './rent-store';

export type RentItem = {
  slug: string;
  name: string;
  spec: string;
  price: number;
  deposit: number;
  image: SiteImageT | null;
  custom: boolean;
  stockTotal: number;
};

export type RentFlowProps = {
  mode: 'catalogue' | 'checkout';
  items: RentItem[];
  packs: (QuotePack & { description: string })[];
  intro: string;
  hours: { pickupFrom: number; returnBy: number; payAtPickupRelease: number };
  contact: { phone: string; tel: string; wa: string; mapsDirections: string };
  turnstileSiteKey: string | null;
  /** Dates passed in the URL (e.g. from the home page's "Rent for an event"). */
  initialRange?: { from: string; to: string } | null;
};

const mono = 'var(--font-mono)';
const eyebrow: React.CSSProperties = { fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: 'rgba(0,0,58,0.6)' };
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
const field = (bad?: boolean): React.CSSProperties => ({
  height: 48,
  padding: '0 14px',
  borderRadius: 10,
  border: `1.5px solid ${bad ? '#B42318' : 'rgba(0,0,58,0.5)'}`,
  background: '#F5F2EA',
  fontSize: 16,
  color: '#00003A',
});
const chipSel = (on: boolean) => ({ border: `1.5px solid ${on ? '#000063' : 'rgba(0,0,99,0.2)'}`, background: on ? '#F6E2B3' : '#FFFFFF' });

function Steps({ step }: { step: number }) {
  const items: [string, AnyIconName][] = [
    ['Dates & items', 'calendar'],
    ['Your details', 'user'],
    ['Pay', 'card'],
  ];
  return (
    <ol aria-label="Reservation steps" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map(([label, icon], i) => {
        const now = i + 1 === step;
        const done = i + 1 < step;
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

function PickupLine({ icon, k, v, size = 30 }: { icon: AnyIconName; k: string; v: string; size?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: size > 30 ? 14 : 13.5 }}>
      <span
        style={{
          width: size,
          height: size,
          borderRadius: size > 30 ? 10 : 9,
          background: '#FFFFFF',
          color: '#000063',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={size > 30 ? 18 : 16} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: size > 30 ? 11.5 : 11, color: 'rgba(0,0,58,0.62)' }}>{k}</span>
        <span>{v}</span>
      </span>
    </div>
  );
}

export function RentFlow(p: RentFlowProps) {
  const router = useRouter();
  const rent = useRent();
  const today = todayInAccra();
  const ready = !!rent.from;
  const [stock, setStock] = useState<{ key: string; free: Record<string, number> } | null>(null);
  const [qtyErr, setQtyErr] = useState<Record<string, string>>({});
  const [step, setStep] = useState(2);
  const [rf, setRf] = useState({ name: '', phone: '', email: '', occasion: 'Wedding' });
  const [re, setRe] = useState<CollectorErrors>({});
  const [plan, setPlan] = useState<'online' | 'at_pickup'>('online');
  // Until Paystack keys are set on the Worker, only "Pay when you collect" is offered.
  const [onlineOn, setOnlineOn] = useState(true);
  useEffect(() => {
    let live = true;
    void onlinePaymentOn()
      .then((on) => {
        if (!live || on) return;
        setOnlineOn(false);
        setPlan('at_pickup');
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
  const [busy, setBusy] = useState(false);
  const [turnstile, setTurnstile] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [sheet, setSheet] = useState<(SheetState & { payRef: string; method: 'momo' | 'card' }) | null>(null);

  useEffect(() => {
    const r = p.initialRange;
    if (r && r.from >= today) setRent({ from: r.from, to: r.to >= r.from ? r.to : r.from });
  }, [p.initialRange, today]);

  const key = `${rent.from}|${rent.to}`;
  useEffect(() => {
    if (!rent.from) return;
    let live = true;
    const t = setTimeout(() => {
      rentalStock(rent.from, rent.to).then((r) => {
        if (!live) return;
        if (r.ok) setStock({ key: `${rent.from}|${rent.to}`, free: r.stock });
        else notify(r.error);
      });
    }, 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [rent.from, rent.to]);
  const loading = !stock || stock.key !== key;
  const freeOf = (slug: string) => (loading ? 0 : (stock!.free[slug] ?? 0));

  const q = useMemo(
    () =>
      quoteRental({
        items: p.items.map((i) => ({ slug: i.slug, name: i.name, price: i.price, deposit: i.deposit })),
        packs: p.packs,
        cart: rent.cart,
        packsOn: rent.packs,
        from: rent.from || today,
        to: rent.to || today,
      }),
    [p.items, p.packs, rent.cart, rent.packs, rent.from, rent.to, today],
  );
  const cartCount = Object.values(rent.cart).filter((n) => n > 0).length;
  const dueNow = plan === 'online' ? q.total : 0;
  const returnDay = rent.to ? addDays(rent.to, 1) : today;
  const rangeLabel =
    q.days === 1 ? formatDayMonth(rent.from || today) : `${formatDayMonth(rent.from || today)} – ${formatDayMonth(rent.to || today)}`;

  const setQty = (slug: string, raw: number) => {
    const it = p.items.find((x) => x.slug === slug)!;
    const max = freeOf(slug);
    let v = Math.max(0, Math.floor(Number.isFinite(raw) ? raw : 0));
    const err = { ...qtyErr };
    if (v > max) {
      err[slug] = max === 0 ? `${it.name}s are all booked for those dates.` : `Only ${max} free for those dates. That's the lot.`;
      v = max;
    } else delete err[slug];
    setQtyErr(err);
    setRent((s) => {
      const cart = { ...s.cart };
      if (v) cart[slug] = v;
      else delete cart[slug];
      return { cart };
    });
  };

  const pickupLines: [AnyIconName, string, string][] = [
    ['pin', 'Pick up at', 'No. 1 Wisepak Lane, New Asofan'],
    ['clock', 'From', `${hourLabel(p.hours.pickupFrom)}, ${formatShortDate(rent.from || today)}`],
    ['undo', 'Return by', `${hourLabel(p.hours.returnBy)}, ${formatShortDate(returnDay)}`],
  ];

  /* ── payment ── */
  const handleStart = (r: Awaited<ReturnType<typeof placeOrder>>) => {
    if (!r.ok) {
      if (r.orderToken) setPending(r.orderToken);
      if (r.errors) {
        setRe(r.errors);
        setStep(2);
      } else if (r.field === 'momo') setMomoErr(r.error);
      else if (r.shortages) {
        setRent((s) => ({
          cart: Object.fromEntries(
            Object.entries(s.cart)
              .map(([k, n]) => [k, Math.min(n, r.shortages![k] ?? 0)])
              .filter(([, n]) => (n as number) > 0),
          ),
        }));
        setFormErr(r.error);
      } else if (r.failed) setFailed(r.error);
      else setFormErr(r.error);
      return;
    }
    if (r.kind === 'confirmed') {
      setRent({ cart: {}, packs: [] });
      router.push(r.href);
      return;
    }
    if (r.orderToken) setPending(r.orderToken);
    if (r.kind === 'momo') {
      setSheet({ stage: r.stage, display: r.display, payRef: r.payRef, method: 'momo' });
      if (r.stage === 'prompt') poll(r.payRef, 'momo');
      return;
    }
    setSheet({ stage: 'card', payRef: r.payRef, method: 'card' });
    openPaystackPopup(r.accessCode)
      .then((out) => {
        if (out === 'success') {
          setSheet({ stage: 'confirming', payRef: r.payRef, method: 'card' });
          poll(r.payRef, 'card');
        } else setSheet(null);
      })
      .catch(() => {
        setSheet(null);
        setFailed('Paystack couldn’t open. Check your connection and try again.');
      });
  };

  const poll = (payRef: string, kind: 'momo' | 'card') => {
    let tries = 0;
    const tick = async () => {
      tries++;
      const s = await paymentState(payRef, kind);
      if (s.state === 'confirmed') {
        setRent({ cart: {}, packs: [] });
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
  };

  const pay = async () => {
    if (plan === 'online' && method !== 'card') {
      const m = checkMomo(momo);
      if (!m.ok) return setMomoErr(m.error);
    }
    setBusy(true);
    setFailed(null);
    setFormErr(null);
    const r = pending
      ? await payForOrder({ token: pending, method, momo })
      : await placeOrder({
          from: rent.from,
          to: rent.to,
          cart: rent.cart,
          packs: rent.packs,
          collector: rf,
          plan,
          method,
          momo,
          turnstile,
        });
    setBusy(false);
    if (!r.ok && pending && /hold ran out/.test(r.error)) setPending(null);
    handleStart(r);
  };

  const next = () => {
    if (p.mode === 'catalogue') {
      if (cartCount) router.push('/rent/checkout');
      return;
    }
    if (step === 2) {
      const c = checkCollector(rf);
      if (!c.ok) return setRe(c.errors);
      if (!momo) setMomo(rf.phone);
      setStep(3);
      window.scrollTo(0, 0);
      return;
    }
    void pay();
  };

  const nextLabel = step === 3 ? (plan === 'online' ? `Pay ${formatGhs(dueNow)}` : 'Reserve items') : 'Continue to payment';
  const lines = rentalReceipt(q);

  /* ── catalogue ── */
  if (p.mode === 'catalogue') {
    return (
      <section data-screen-label="Rentals · Catalogue" style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
        <Steps step={1} />
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
            Rent for
            <br />
            <em style={{ fontWeight: 300 }}>the big day.</em>
          </h1>
          <p style={{ margin: 0, fontSize: 16, lineHeight: 1.55, color: 'rgba(0,0,58,0.72)', maxWidth: 460 }}>{p.intro}</p>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            padding: 16,
            borderRadius: 20,
            background: '#00003A',
            color: '#F5F2EA',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 }}>
            <span style={{ ...eyebrow, color: '#F5F2EA', opacity: 0.9 }}>FROM</span>
            {ready && (
              <DatePicker
                variant="dark"
                label="From"
                value={rent.from}
                min={today}
                rangeStart={rent.from}
                rangeEnd={rent.to}
                onChange={(v) => setRent((s) => ({ from: v, to: s.to < v ? v : s.to }))}
              />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 190 }}>
            <span style={{ ...eyebrow, color: '#F5F2EA', opacity: 0.9 }}>TO</span>
            {ready && (
              <DatePicker
                variant="dark"
                label="To"
                value={rent.to}
                min={rent.from}
                rangeStart={rent.from}
                rangeEnd={rent.to}
                onChange={(v) => setRent({ to: v })}
              />
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '0 8px 6px' }}>
            <span style={{ fontFamily: mono, fontSize: 20 }}>
              {q.days} day{q.days === 1 ? '' : 's'}
            </span>
            <span style={{ fontSize: 12, opacity: 0.7 }}>Stock shown for {rangeLabel}</span>
          </div>
          <div style={{ flex: 1 }} />
          <Link href="/venues" style={{ color: '#F5F2EA', fontSize: 13, paddingBottom: 12 }}>
            Need the venue too? <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'var(--c-main)', gap: 40, alignItems: 'start' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 32, minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 30 }}>
                  Packs <em style={{ fontWeight: 300 }}>(cheaper together)</em>
                </h2>
                <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.6)' }}>Adds everything at once. Adjust quantities after.</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--c3)', gap: 12 }}>
                {p.packs.map((b) => {
                  const full = Object.entries(b.items).reduce(
                    (t, [slug, n]) => t + n * (p.items.find((i) => i.slug === slug)?.price ?? 0),
                    0,
                  );
                  const shortSlug = loading ? undefined : Object.entries(b.items).find(([slug, n]) => freeOf(slug) < n)?.[0];
                  const on = rent.packs.includes(b.name) && packFits(b, rent.cart);
                  return (
                    <div
                      key={b.name}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 12,
                        padding: 18,
                        borderRadius: 20,
                        border: `1.5px solid ${on ? '#000063' : 'rgba(0,0,99,0.14)'}`,
                        background: '#FFFFFF',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontFamily: 'var(--font-serif)', fontSize: 24 }}>{b.name}</span>
                        <span
                          style={{
                            fontFamily: mono,
                            fontSize: 11,
                            padding: '3px 8px',
                            borderRadius: 999,
                            background: '#F6E2B3',
                            color: '#000063',
                          }}
                        >
                          −{b.pctOff}%
                        </span>
                      </div>
                      <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.7)' }}>{b.description}</span>
                      <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: mono, fontSize: 13 }}>
                        <span style={{ textDecoration: 'line-through', color: 'rgba(0,0,58,0.62)' }}>{formatGhs(full)}</span>
                        <span
                          style={{
                            flex: 1,
                            borderBottom: '1.5px dotted rgba(0,0,58,0.35)',
                            margin: '0 8px',
                            transform: 'translateY(-4px)',
                          }}
                        />
                        <span style={{ fontWeight: 500 }}>{formatGhs(Math.round(full * (1 - b.pctOff / 100)))} / day</span>
                      </div>
                      {shortSlug && (
                        <span role="alert" style={{ fontSize: 12, color: '#B42318' }}>
                          Not enough {p.items.find((i) => i.slug === shortSlug)?.name.toLowerCase()}s free on these dates for this pack.
                        </span>
                      )}
                      <button
                        type="button"
                        disabled={!!shortSlug || on || loading}
                        onClick={() => {
                          setRent((s) => {
                            const cart = { ...s.cart };
                            for (const [slug, n] of Object.entries(b.items)) cart[slug] = Math.max(cart[slug] ?? 0, n);
                            return { cart, packs: [...new Set([...s.packs, b.name])] };
                          });
                          notify(`${b.name} added to your reservation.`, `${b.pctOff}% off those items.`);
                        }}
                        className="aw-press"
                        style={{
                          height: 44,
                          borderRadius: 10,
                          border: '1px solid #000063',
                          background: on ? '#000063' : 'transparent',
                          color: on ? '#F5F2EA' : '#000063',
                          fontSize: 14,
                          opacity: shortSlug ? 0.5 : 1,
                        }}
                      >
                        {on ? 'Added to reservation ✓' : 'Add this pack'}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <h2 style={{ margin: 0, fontFamily: 'var(--font-serif)', fontWeight: 400, fontSize: 30 }}>Everything, by the unit</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'var(--c-items)', gap: 12 }}>
                {loading
                  ? [1, 2, 3, 4].map((x) => (
                      <div
                        key={x}
                        aria-busy="true"
                        style={{ height: 380, borderRadius: 12, background: '#F6E2B3', animation: 'aw-shimmer 1.4s ease-in-out infinite' }}
                      />
                    ))
                  : p.items.map((it) => {
                      const av = freeOf(it.slug);
                      const n = rent.cart[it.slug] ?? 0;
                      const tone = av === 0 ? ['#EFE9E6', '#B42318'] : av < 20 ? ['#F2B544', '#00003A'] : ['#F6E2B3', '#000063'];
                      const step = qtyStep(it.stockTotal);
                      return (
                        <article
                          key={it.slug}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            borderRadius: 20,
                            background: '#FFFFFF',
                            border: '1px solid rgba(0,0,99,0.14)',
                            overflow: 'hidden',
                            opacity: av === 0 ? 0.6 : 1,
                          }}
                        >
                          <div
                            style={{
                              position: 'relative',
                              aspectRatio: 'var(--item-ar)',
                              background: '#F5F2EA',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              padding: 18,
                            }}
                          >
                            {it.image ? (
                              <SiteImage
                                image={it.image}
                                alt={it.name}
                                fill
                                sizes="(min-width: 1024px) 25vw, 100vw"
                                grade={false}
                                style={{ objectFit: 'contain', padding: 18, mixBlendMode: 'multiply' }}
                              />
                            ) : (
                              <div
                                style={{
                                  position: 'absolute',
                                  inset: 12,
                                  borderRadius: 2,
                                  background: 'repeating-linear-gradient(135deg,#E3E4F5 0 8px,#F5F2EA 8px 16px)',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontFamily: mono,
                                  fontSize: 11,
                                  color: 'rgba(0,0,58,0.62)',
                                }}
                              >
                                Photo coming soon
                              </div>
                            )}
                            {it.custom && (
                              <span
                                style={{
                                  position: 'absolute',
                                  top: 10,
                                  left: 10,
                                  fontFamily: mono,
                                  fontSize: 11,
                                  padding: '3px 7px',
                                  borderRadius: 4,
                                  background: '#00003A',
                                  color: '#F5F2EA',
                                }}
                              >
                                NEW
                              </span>
                            )}
                          </div>
                          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>{it.name}</span>
                              <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.65)' }}>{it.spec}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'baseline', fontFamily: mono, fontSize: 13 }}>
                              <span>{formatGhs(it.price)}</span>
                              <span style={{ opacity: 0.55 }}> /unit /day</span>
                              <span
                                style={{
                                  flex: 1,
                                  borderBottom: '1.5px dotted rgba(0,0,58,0.3)',
                                  margin: '0 8px',
                                  transform: 'translateY(-4px)',
                                }}
                              />
                              <span style={{ opacity: 0.6 }}>dep. {formatGhs(it.deposit, { prefix: false })}</span>
                            </div>
                            <span
                              style={{
                                alignSelf: 'flex-start',
                                fontFamily: mono,
                                fontSize: 11,
                                padding: '4px 8px',
                                borderRadius: 999,
                                background: tone[0],
                                color: tone[1],
                              }}
                            >
                              {av === 0 ? `All booked for ${formatDayMonth(rent.from)}` : `${av} available on ${formatDayMonth(rent.from)}`}
                            </span>
                            <div style={{ flex: 1 }} />
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div
                                role="group"
                                aria-label={`${it.name} quantity`}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  border: `1.5px solid ${qtyErr[it.slug] ? '#B42318' : 'rgba(0,0,58,0.5)'}`,
                                  borderRadius: 10,
                                  overflow: 'hidden',
                                  background: '#FFFFFF',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => setQty(it.slug, n - step)}
                                  disabled={n === 0}
                                  aria-label={`Fewer ${it.name.toLowerCase()}s`}
                                  style={{
                                    width: 44,
                                    height: 44,
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 18,
                                    opacity: n === 0 ? 0.35 : 1,
                                  }}
                                >
                                  −
                                </button>
                                <input
                                  autoComplete="off"
                                  enterKeyHint="done"
                                  inputMode="numeric"
                                  aria-label="Quantity"
                                  value={n}
                                  onChange={(e) => setQty(it.slug, Number(e.target.value.replace(/\D/g, '')))}
                                  style={{
                                    width: 56,
                                    height: 44,
                                    border: 'none',
                                    textAlign: 'center',
                                    fontFamily: mono,
                                    fontSize: 16,
                                    background: 'transparent',
                                    color: '#00003A',
                                  }}
                                />
                                <button
                                  type="button"
                                  onClick={() => setQty(it.slug, n + step)}
                                  disabled={n >= av}
                                  aria-label={`More ${it.name.toLowerCase()}s`}
                                  style={{
                                    width: 44,
                                    height: 44,
                                    border: 'none',
                                    background: 'transparent',
                                    fontSize: 18,
                                    opacity: n >= av ? 0.35 : 1,
                                  }}
                                >
                                  +
                                </button>
                              </div>
                              <span style={{ marginLeft: 'auto', fontFamily: mono, fontSize: 13 }}>
                                {n ? formatGhs(n * it.price * q.days) : ''}
                              </span>
                            </div>
                            {qtyErr[it.slug] && (
                              <span role="alert" style={{ fontSize: 12, color: '#B42318' }}>
                                {qtyErr[it.slug]}
                              </span>
                            )}
                          </div>
                        </article>
                      );
                    })}
              </div>
            </div>
          </div>

          <aside
            aria-label="Your reservation"
            style={{
              position: 'var(--sticky)' as React.CSSProperties['position'],
              top: 96,
              background: '#FFFFFF',
              border: '1px solid rgba(0,0,99,0.14)',
              borderRadius: 20,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12 }}>
              <span style={{ fontFamily: 'var(--font-serif)', fontSize: 26, letterSpacing: '-0.05em' }}>Your reservation</span>
              <span style={{ fontFamily: mono, fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>
                {q.days} day{q.days === 1 ? '' : 's'}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 10, background: '#F6E2B3' }}>
              {pickupLines.map(([icon, k, v]) => (
                <PickupLine key={k} icon={icon} k={k} v={v} />
              ))}
            </div>
            {cartCount === 0 ? (
              <div
                style={{
                  padding: '24px 12px',
                  border: '1.5px dashed rgba(0,0,99,0.2)',
                  borderRadius: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 8,
                  textAlign: 'center',
                }}
              >
                <span
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 14,
                    background: 'rgba(0,0,99,0.06)',
                    color: '#000063',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Icon name="tent" size={24} />
                </span>
                <span style={{ fontSize: 15, fontWeight: 500 }}>Nothing picked yet</span>
                <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.65)' }}>Add a pack, or tap + on any item.</span>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {p.items
                    .filter((it) => rent.cart[it.slug])
                    .map((it) => {
                      const n = rent.cart[it.slug]!;
                      const step = qtyStep(it.stockTotal);
                      const tap: React.CSSProperties = {
                        width: 'max(30px, var(--tap-min, 0px))',
                        height: 'max(30px, var(--tap-min, 0px))',
                        borderRadius: 8,
                        border: '1px solid rgba(0,0,99,0.2)',
                        background: '#FFFFFF',
                      };
                      return (
                        <div
                          key={it.slug}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '44px minmax(0,1fr) auto',
                            gap: 10,
                            alignItems: 'center',
                            padding: '10px 0',
                            borderBottom: '1px solid rgba(0,0,99,0.1)',
                          }}
                        >
                          <div
                            style={{
                              position: 'relative',
                              width: 44,
                              height: 44,
                              borderRadius: 8,
                              background: '#F5F2EA',
                              overflow: 'hidden',
                            }}
                          >
                            {it.image && (
                              <SiteImage
                                image={it.image}
                                alt=""
                                fill
                                sizes="44px"
                                grade={false}
                                style={{ objectFit: 'contain', padding: 3, mixBlendMode: 'multiply' }}
                              />
                            )}
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
                            <span style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {it.name}
                            </span>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <button
                                type="button"
                                onClick={() => setQty(it.slug, n - step)}
                                aria-label={`Fewer ${it.name.toLowerCase()}s`}
                                style={tap}
                              >
                                −
                              </button>
                              <span style={{ fontFamily: mono, fontSize: 12.5, minWidth: 32, textAlign: 'center' }}>{n}</span>
                              <button
                                type="button"
                                onClick={() => setQty(it.slug, n + step)}
                                disabled={n >= freeOf(it.slug)}
                                aria-label={`More ${it.name.toLowerCase()}s`}
                                style={{ ...tap, opacity: n >= freeOf(it.slug) ? 0.4 : 1 }}
                              >
                                +
                              </button>
                              <button
                                type="button"
                                onClick={() => setQty(it.slug, 0)}
                                aria-label={`Remove ${it.name.toLowerCase()}s`}
                                style={{
                                  ...tap,
                                  marginLeft: 2,
                                  border: 'none',
                                  background: 'transparent',
                                  color: 'rgba(0,0,58,0.55)',
                                  fontSize: 16,
                                }}
                              >
                                ×
                              </button>
                            </div>
                          </div>
                          <span style={{ fontFamily: mono, fontSize: 12.5 }}>{formatGhs(n * it.price * q.days)}</span>
                        </div>
                      );
                    })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontFamily: mono, fontSize: 12.5 }}>
                  <div style={{ display: 'flex' }}>
                    <span>RENTAL</span>
                    <span style={{ flex: 1 }} />
                    <span>{formatGhs(q.subtotal)}</span>
                  </div>
                  {q.discount > 0 && (
                    <div style={{ display: 'flex', color: '#1F7A4D' }}>
                      <span>PACK DISCOUNT</span>
                      <span style={{ flex: 1 }} />
                      <span>− {formatGhs(q.discount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', color: 'rgba(0,0,58,0.62)' }}>
                    <span>REFUNDABLE DEPOSIT</span>
                    <span style={{ flex: 1 }} />
                    <span>{formatGhs(q.deposit)}</span>
                  </div>
                  <div style={{ display: 'flex', fontSize: 15, fontWeight: 500, paddingTop: 8, borderTop: '1px solid rgba(0,0,99,0.2)' }}>
                    <span>TOTAL</span>
                    <span style={{ flex: 1 }} />
                    <span>{formatGhs(q.total)}</span>
                  </div>
                </div>
              </>
            )}
            <button
              type="button"
              data-mi-btn=""
              onClick={next}
              disabled={!cartCount}
              style={{
                minHeight: 52,
                border: 'none',
                borderRadius: 10,
                background: cartCount ? '#000063' : 'rgba(0,0,58,0.12)',
                color: cartCount ? '#F5F2EA' : 'rgba(0,0,58,0.45)',
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              {cartCount ? `Continue · ${formatGhs(q.total)}` : 'Choose items to continue'}
            </button>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.5, color: 'rgba(0,0,58,0.62)' }}>
              No charge yet. On the next step, pay online or choose to pay when you collect. Questions? <a href={p.contact.tel}>Call</a> or{' '}
              <a href={p.contact.wa}>WhatsApp</a> the desk.
            </p>
          </aside>
        </div>
        <MobileBar
          amount={cartCount ? formatGhs(q.subtotal - q.discount) : 'Nothing picked yet'}
          note={`${cartCount} item${cartCount === 1 ? '' : 's'} · ${q.days} day${q.days === 1 ? '' : 's'}`}
          label={cartCount ? 'Continue' : 'Choose items'}
          onClick={next}
          disabled={!cartCount}
        />
      </section>
    );
  }

  /* ── checkout ── */
  if (ready && cartCount === 0) {
    return (
      <>
        <div style={{ marginBottom: 28 }}>
          <Steps step={2} />
        </div>
        <div
          style={{
            padding: '48px 24px',
            border: '1px dashed rgba(0,0,99,0.3)',
            borderRadius: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontFamily: 'var(--font-serif)', fontSize: 30 }}>Nothing reserved yet. Not a chair in sight.</span>
          <Link
            href="/rent"
            data-mi-btn="fill"
            style={{
              display: 'flex',
              alignItems: 'center',
              height: 46,
              padding: '0 18px',
              borderRadius: 10,
              background: '#000063',
              color: '#F5F2EA',
              textDecoration: 'none',
              fontSize: 14,
            }}
          >
            Choose items
          </Link>
        </div>
      </>
    );
  }

  const planOpts: ['online' | 'at_pickup', string, string, string, AnyIconName][] = [
    ...(onlineOn
      ? ([['online', 'Pay online now', 'MoMo or card. At pickup, just show your reference.', formatGhs(q.total), 'smartphone']] as [
          'online',
          string,
          string,
          string,
          AnyIconName,
        ][])
      : []),
    [
      'at_pickup',
      'Pay when you collect',
      `Cash, MoMo or card at the front desk. We hold your items until ${hourLabel(p.hours.payAtPickupRelease)} on pickup day.`,
      'GHS 0 now',
      'store',
    ],
  ];
  const isMomo = PAY_METHODS.find((m) => m.id === method)!.momo;

  return (
    <>
      <div style={{ marginBottom: 28 }}>
        <Steps step={step} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'var(--c-main)', gap: 40, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0 }}>
          {step === 2 && (
            <section
              data-screen-label="Rentals · 2 Details"
              style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'aw-up 300ms var(--ease-enter)' }}
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
                Who&apos;s
                <br />
                <em style={{ fontWeight: 300 }}>collecting?</em>
              </h1>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'var(--c2)',
                  gap: 16,
                  background: '#FFFFFF',
                  border: '1px solid rgba(0,0,99,0.14)',
                  borderRadius: 20,
                  padding: 20,
                }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="user" size={16} />
                    Full name
                  </span>
                  <input
                    autoComplete="name"
                    autoCapitalize="words"
                    enterKeyHint="next"
                    value={rf.name}
                    maxLength={120}
                    onChange={(e) => {
                      setRf({ ...rf, name: e.target.value });
                      setRe({ ...re, name: undefined });
                    }}
                    placeholder="e.g. Abena Owusu"
                    aria-invalid={!!re.name}
                    aria-describedby={re.name ? 'rf-name-err' : undefined}
                    style={field(!!re.name)}
                  />
                  {re.name && (
                    <span id="rf-name-err" role="alert" style={{ color: '#B42318', fontSize: 12 }}>
                      {re.name}
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
                    value={rf.phone}
                    onChange={(e) => {
                      setRf({ ...rf, phone: e.target.value });
                      setRe({ ...re, phone: undefined });
                    }}
                    placeholder="055 555 7090"
                    aria-invalid={!!re.phone}
                    aria-describedby={re.phone ? 'rf-phone-err' : undefined}
                    style={{ ...field(!!re.phone), fontFamily: mono }}
                  />
                  {re.phone && (
                    <span id="rf-phone-err" role="alert" style={{ color: '#B42318', fontSize: 12 }}>
                      {re.phone}
                    </span>
                  )}
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="mail" size={16} />
                    Email (optional)
                  </span>
                  <input
                    autoComplete="email"
                    autoCapitalize="none"
                    spellCheck={false}
                    enterKeyHint="next"
                    type="email"
                    value={rf.email}
                    onChange={(e) => {
                      setRf({ ...rf, email: e.target.value });
                      setRe({ ...re, email: undefined });
                    }}
                    placeholder="you@example.com"
                    aria-invalid={!!re.email}
                    style={field(!!re.email)}
                  />
                  {re.email && (
                    <span role="alert" style={{ color: '#B42318', fontSize: 12 }}>
                      {re.email}
                    </span>
                  )}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon name="sparkle" size={16} />
                    What&apos;s the occasion?
                  </span>
                  <Select
                    variant="field"
                    ariaLabel="Occasion"
                    value={rf.occasion}
                    options={OCCASIONS}
                    onChange={(v) => setRf({ ...rf, occasion: v })}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 18, borderRadius: 20, background: '#F6E2B3' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 500 }}>
                  <Icon name="store" size={18} />
                  Pickup &amp; return, no delivery
                </span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
                  {pickupLines.map(([icon, k, v]) => (
                    <PickupLine key={k} icon={icon} k={k} v={v} size={36} />
                  ))}
                </div>
                <span style={{ fontSize: 13, color: 'rgba(0,0,58,0.72)' }}>
                  Bring a vehicle big enough. 200 chairs don&apos;t fit in a Corolla, we&apos;ve checked.
                </span>
                <a
                  href={p.contact.mapsDirections}
                  target="_blank"
                  rel="noopener"
                  style={{
                    alignSelf: 'flex-start',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    height: 'max(42px, var(--tap-min, 0px))',
                    padding: '0 14px',
                    borderRadius: 10,
                    background: '#FFFFFF',
                    color: '#00003A',
                    textDecoration: 'none',
                    fontSize: 14,
                  }}
                >
                  <Icon name="googlemaps" size={16} />
                  Get directions
                </a>
              </div>
            </section>
          )}
          {step === 3 && (
            <section
              data-screen-label="Rentals · 3 Pay"
              style={{ display: 'flex', flexDirection: 'column', gap: 20, animation: 'aw-up 300ms var(--ease-enter)' }}
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
                How would you
                <br />
                <em style={{ fontWeight: 300 }}>like to pay?</em>
              </h1>
              {failed && (
                <div
                  role="alert"
                  style={{
                    padding: '16px 18px',
                    borderRadius: 10,
                    background: '#FFFFFF',
                    border: '1.5px solid #B42318',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                  }}
                >
                  <strong style={{ fontWeight: 500, color: '#B42318' }}>Payment didn&apos;t go through.</strong>
                  <span style={{ fontSize: 14 }}>{failed} Nothing was charged. Your items are held for 15 minutes.</span>
                  <div style={{ display: 'flex', gap: 8 }}>
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
                      Use a card
                    </button>
                  </div>
                </div>
              )}
              <div
                style={{
                  padding: '16px 18px',
                  borderRadius: 10,
                  background: '#F6E2B3',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 6,
                  fontSize: 14,
                  lineHeight: 1.55,
                }}
              >
                <strong style={{ fontWeight: 500 }}>Security deposit &amp; damage policy</strong>
                <span>
                  We hold a refundable security deposit of <span style={{ fontFamily: mono }}>{formatGhs(q.deposit)}</span>. When everything
                  comes back, we count it in front of you. Missing or broken items are deducted at the per-unit deposit rate, and the rest
                  is refunded the way you paid within 48 hours. Paying at pickup? The deposit is paid at the desk too. Light dirt is fine.
                  Burns, tears and anything that&apos;s gone home with Auntie are not.
                </span>
              </div>
              <fieldset style={{ border: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <legend style={{ ...eyebrow, marginBottom: 10 }}>PAY ONLINE OR AT PICKUP</legend>
                <div role="radiogroup" aria-label="Pay online or at pickup" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {planOpts.map(([id, label, note, amt, icon]) => (
                    <button
                      key={id}
                      type="button"
                      role="radio"
                      aria-checked={plan === id}
                      disabled={!!pending && id === 'at_pickup'}
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
              {plan === 'online' && (
                <>
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
                  {isMomo && (
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, maxWidth: 360 }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Icon name="smartphone" size={16} />
                        {PAY_METHODS.find((m) => m.id === method)!.label} number
                      </span>
                      <input
                        type="tel"
                        autoComplete="tel-national"
                        enterKeyHint="next"
                        inputMode="tel"
                        value={momo}
                        onChange={(e) => {
                          setMomo(e.target.value);
                          setMomoErr(null);
                        }}
                        placeholder="024 412 3456"
                        aria-invalid={!!momoErr}
                        style={{ ...field(!!momoErr), background: '#FFFFFF', fontFamily: mono }}
                      />
                      {momoErr && (
                        <span role="alert" style={{ color: '#B42318', fontSize: 12 }}>
                          {momoErr}
                        </span>
                      )}
                    </label>
                  )}
                </>
              )}
              {formErr && (
                <p role="alert" style={{ margin: 0, fontSize: 14, color: '#B42318' }}>
                  {formErr}
                </p>
              )}
              <Turnstile siteKey={p.turnstileSiteKey} onToken={setTurnstile} />
            </section>
          )}
        </div>
        <aside
          aria-label="Order summary"
          style={{
            position: 'var(--sticky)' as React.CSSProperties['position'],
            top: 88,
            background: '#FFFFFF',
            border: '1px solid rgba(0,0,99,0.14)',
            borderRadius: 20,
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <span style={{ fontFamily: 'var(--font-serif)', fontSize: 22 }}>Your reservation</span>
            <span style={{ fontFamily: mono, fontSize: 12, color: 'rgba(0,0,58,0.6)' }}>
              {q.days} day{q.days === 1 ? '' : 's'} · {rangeLabel}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'rgba(0,0,58,0.72)' }}>
            <Icon name="store" size={16} />
            Pickup · Wisepak Lane · {formatDayMonth(rent.from || today)}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              fontFamily: mono,
              fontSize: 12.5,
              borderTop: '1.5px dashed rgba(0,0,99,0.3)',
              paddingTop: 12,
            }}
          >
            {lines.map((l) => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'baseline', color: l.color }}>
                <span>{l.label}</span>
                <span style={{ flex: 1, borderBottom: '1.5px dotted rgba(0,0,58,0.3)', margin: '0 8px', transform: 'translateY(-4px)' }} />
                <span>{l.amount}</span>
              </div>
            ))}
            <div style={{ display: 'flex', fontSize: 15, fontWeight: 500, paddingTop: 8, borderTop: '1px solid rgba(0,0,99,0.2)' }}>
              <span>TOTAL</span>
              <span style={{ flex: 1 }} />
              <span>{formatGhs(q.total)}</span>
            </div>
            {step === 3 && (
              <div style={{ display: 'flex', color: '#000063' }}>
                <span>DUE NOW</span>
                <span style={{ flex: 1 }} />
                <span>{formatGhs(dueNow)}</span>
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                if (step <= 2) router.push('/rent');
                else {
                  setStep(2);
                  setFailed(null);
                }
              }}
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
            <button
              type="button"
              onClick={next}
              disabled={busy}
              data-mi-btn="fill"
              style={{
                flex: 1,
                minHeight: 52,
                border: 'none',
                borderRadius: 10,
                background: '#000063',
                color: '#F5F2EA',
                fontWeight: 600,
                fontSize: 15,
              }}
            >
              {busy ? 'One moment…' : nextLabel}
            </button>
          </div>
        </aside>
      </div>
      <MobileBar
        amount={formatGhs(q.subtotal - q.discount)}
        note={`${cartCount} item${cartCount === 1 ? '' : 's'} · ${q.days} day${q.days === 1 ? '' : 's'}`}
        label={step === 3 ? 'Pay' : 'Continue'}
        onClick={next}
        disabled={busy}
      />
      {sheet && (
        <PaySheet
          state={sheet}
          amount={formatGhs(dueNow)}
          onClose={() => setSheet(null)}
          onSubmitOtp={async (code) => {
            const r = await sendMomoCode(sheet.payRef, code);
            if (!r.ok) return r.error;
            setSheet({ stage: 'prompt', display: r.display, payRef: sheet.payRef, method: 'momo' });
            poll(sheet.payRef, 'momo');
            return null;
          }}
        />
      )}
    </>
  );
}

function MobileBar({
  amount,
  note,
  label,
  onClick,
  disabled,
}: {
  amount: string;
  note: string;
  label: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <>
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
          <span style={{ fontFamily: mono, fontSize: 15, fontWeight: 500 }}>{amount}</span>
          <span style={{ fontSize: 12, color: 'rgba(0,0,58,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {note}
          </span>
        </div>
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          style={{
            height: 48,
            padding: '0 20px',
            border: 'none',
            borderRadius: 10,
            background: '#000063',
            color: '#F5F2EA',
            fontWeight: 600,
            fontSize: 15,
            opacity: disabled ? 0.45 : 1,
          }}
        >
          {label}
        </button>
      </div>
    </>
  );
}
