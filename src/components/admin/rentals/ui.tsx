'use client';
// Rental order and venue enquiry UI from Admin.dc.html: the order buttons by
// status, take payment, return checklist, refund, quote builder, and the order
// and enquiry drawers.
import { useEffect, useState } from 'react';
import {
  advanceOrderAction,
  cancelOrderAction,
  deleteOrderAction,
  enquiryStageAction,
  loadEnquiry,
  loadOrder,
  orderBackAction,
  orderPaymentAction,
  refundOrderAction,
  returnChecklistAction,
  saveEnquiryNote,
  saveOrderNote,
  sendQuoteAction,
} from '@/app/admin/(app)/rentals/actions';
import { DESK_METHODS, ENQUIRY_STAGE, METHOD, RENTAL_STATUS, type EnquiryStage, type RentalStatus } from '@/lib/admin/labels';
import { addDays, formatDayMonth } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { formatPhoneLocal, telHref, whatsappHref } from '@/lib/phone';
import { BackModal } from '../bookings/modals';
import { useAdmin } from '../context';
import { DrawerFrame, DrawerLoading } from '../drawer';
import { invoiceAction } from '../export';
import { ConfirmModal, FieldGrid, Lines, ModalFrame, Note, PasswordField, SelectField, StepperRows, TextField } from '../modal';
import type { Action } from '../ui';
import { useAction } from '../use-action';

const METHOD_OPTS = DESK_METHODS.map((m) => ({ value: m, label: METHOD[m] }));
const NEXT: Partial<Record<RentalStatus, RentalStatus>> = { reserved: 'ready_for_pickup', ready_for_pickup: 'collected' };
const PREV: Partial<Record<RentalStatus, RentalStatus>> = {
  ready_for_pickup: 'reserved',
  collected: 'ready_for_pickup',
  returned: 'collected',
};

export type OrderLike = {
  ref: string;
  who: string;
  phone: string;
  status: RentalStatus;
  total: number;
  paid: number;
  refundable?: number;
  refunded?: number;
  refundPending?: boolean;
};

export function useOrderActions() {
  const { can, openModal, openDrawer, toast, refresh, me } = useAdmin();
  const quick = (fn: () => Promise<{ ok: boolean; title?: string; body?: string; error?: string }>) => async () => {
    const r = await fn();
    toast(r.ok ? (r.title ?? 'Done.') : (r.error ?? 'That didn’t work.'), r.ok ? r.body : undefined);
    if (r.ok) refresh();
  };
  return (o: OrderLike, inDrawer: boolean): Action[] => {
    const a: Action[] = [];
    const due = o.total - o.paid;
    const next = NEXT[o.status];
    const prev = PREV[o.status];
    const unpaidPickup = (o.status === 'ready_for_pickup' || o.status === 'pending_payment') && due > 0;
    if (prev && can('rentals.status') && !(o.status === 'returned' && !o.refundPending && inDrawer === false))
      a.push({
        label: `Move back to ${RENTAL_STATUS[prev].toLowerCase()}`,
        icon: 'arrowleft',
        iconOnly: !inDrawer,
        on: () =>
          openModal(
            <BackModal
              refLabel={o.ref}
              from={RENTAL_STATUS[o.status]}
              to={RENTAL_STATUS[prev]}
              onSubmit={(why) => orderBackAction(o.ref, why)}
            />,
          ),
      });
    if (unpaidPickup && can('rentals.payment.desk'))
      a.push({
        label: o.status === 'pending_payment' ? 'Mark paid' : 'Take payment',
        icon: 'cash',
        kind: 'primary',
        hint: `${formatGhs(due)} due before handover`,
        on: () => openModal(<OrderPaymentModal o={o} />),
      });
    if (next && !unpaidPickup && can('rentals.status'))
      a.push({
        label: `Mark ${RENTAL_STATUS[next].toLowerCase()}`,
        icon: 'arrowright',
        kind: 'primary',
        on: quick(() => advanceOrderAction(o.ref)),
      });
    if (o.status === 'collected' && can('rentals.checklist'))
      a.push({ label: 'Return checklist', icon: 'clipboard', kind: 'primary', on: () => openModal(<ReturnModal r={o.ref} />) });
    if (!inDrawer) a.push({ label: 'Open details', icon: 'eye', iconOnly: true, on: () => openDrawer({ kind: 'rental', ref: o.ref }) });
    if (inDrawer) {
      if (o.phone) a.push({ label: 'Call customer', icon: 'phone', on: () => (location.href = telHref(o.phone)) });
      if (['pending_payment', 'reserved', 'ready_for_pickup'].includes(o.status) && can('rentals.status'))
        a.push({
          label: 'Cancel order',
          icon: 'ban',
          kind: 'danger',
          on: () =>
            openModal(
              <ConfirmModal
                title={`Cancel ${o.ref}?`}
                sub="The items go back into stock."
                confirm="Cancel order"
                run={() => cancelOrderAction(o.ref)}
              />,
            ),
        });
      if (me.isSuper && (o.refundable ?? 0) > 0) a.push({ label: 'Refund', icon: 'undo', on: () => openModal(<OrderRefundModal o={o} />) });
      if (can('rentals.delete'))
        a.push({
          label: 'Delete',
          icon: 'trash',
          kind: 'danger',
          on: () =>
            openModal(
              <ConfirmModal
                title={`Delete ${o.ref}?`}
                sub="Frees the stock and removes it from reports. Only for test or duplicate orders with no payments."
                confirm="Delete forever"
                run={() => deleteOrderAction(o.ref)}
              />,
            ),
        });
    }
    return a;
  };
}

function OrderPaymentModal({ o }: { o: OrderLike }) {
  const { run, busy, errors, setErrors } = useAction();
  const due = o.total - o.paid;
  const [f, setF] = useState({ method: 'cash', txn: '', pw: '' });
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors({ ...errors, [k]: '' });
  };
  return (
    <ModalFrame
      title={o.status === 'pending_payment' ? 'Mark as paid' : 'Take payment'}
      sub={`${o.ref} · ${o.who}`}
      confirm={`Record ${formatGhs(due)}`}
      busy={busy}
      onConfirm={() => run(() => orderPaymentAction({ ref: o.ref, method: f.method, txn: f.txn, password: f.pw }))}
    >
      <FieldGrid>
        <SelectField label="Payment method" value={f.method} onChange={set('method')} options={METHOD_OPTS} />
        {f.method !== 'cash' && (
          <TextField
            label="Transaction ID"
            value={f.txn}
            onChange={set('txn')}
            placeholder="e.g. 8291034475"
            hint="From the MoMo message or card slip"
            err={errors.txn}
          />
        )}
        <PasswordField value={f.pw} onChange={set('pw')} err={errors.pw} wide />
      </FieldGrid>
      <Lines lines={[{ k: 'AMOUNT DUE', v: formatGhs(due), weight: 600 }]} />
    </ModalFrame>
  );
}

function OrderRefundModal({ o }: { o: OrderLike }) {
  const { run, busy, errors, setErrors } = useAction();
  const [f, setF] = useState({ amount: '', reason: 'Deposit return', pw: '' });
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors({ ...errors, [k]: '' });
  };
  return (
    <ModalFrame
      title="Issue a refund"
      sub={`${o.ref} · paid ${formatGhs(o.paid)}${o.refunded ? `, ${formatGhs(o.refunded)} already refunded` : ''}. It goes back the way they paid.`}
      confirm="Issue refund"
      danger
      busy={busy}
      onConfirm={() => run(() => refundOrderAction({ ref: o.ref, amount: f.amount, reason: f.reason, password: f.pw }))}
    >
      <FieldGrid>
        <TextField
          label="Amount (GHS)"
          value={f.amount}
          onChange={set('amount')}
          numeric
          hint={`Up to ${formatGhs(o.refundable ?? 0)}`}
          err={errors.amount}
        />
        <SelectField
          label="Reason"
          value={f.reason}
          onChange={set('reason')}
          options={['Deposit return', 'Customer cancelled', 'Overcharged', 'Goodwill', 'Other']}
        />
        <PasswordField value={f.pw} onChange={set('pw')} err={errors.pw} wide />
      </FieldGrid>
      <Note>Logged with your name, the amount and the reason.</Note>
    </ModalFrame>
  );
}

function ReturnModal({ r }: { r: string }) {
  const { me } = useAdmin();
  const { run, busy, errors, setErrors } = useAction();
  const [o, setO] = useState<Awaited<ReturnType<typeof loadOrder>>>(null);
  const [rows, setRows] = useState<Record<string, { back: number; damaged: number }>>({});
  const [pw, setPw] = useState('');
  useEffect(() => {
    void loadOrder(r).then((x) => {
      setO(x);
      if (x) setRows(Object.fromEntries(x.lines.map((l) => [l.itemId, { back: l.qty, damaged: 0 }])));
    });
  }, [r]);
  if (!o) return null;
  const rowOf = (l: (typeof o.lines)[number]) => rows[l.itemId] ?? { back: l.qty, damaged: 0 };
  const ded = o.lines.reduce((t, l) => t + (l.qty - rowOf(l).back + rowOf(l).damaged) * l.deposit, 0);
  const stepRows = o.lines.map((l) => {
    const row = rowOf(l);
    const d = (l.qty - row.back + row.damaged) * l.deposit;
    const upd = (k: 'back' | 'damaged', v: number) => setRows((x) => ({ ...x, [l.itemId]: { ...row, [k]: v } }));
    return {
      label: l.name,
      sub: `${l.qty} out · deposit ${formatGhs(l.deposit)} each`,
      steppers: [
        {
          label: `${l.name} returned`,
          value: row.back,
          dec: () => upd('back', Math.max(0, row.back - 1)),
          inc: () => upd('back', Math.min(l.qty, row.back + 1)),
        },
        {
          label: `${l.name} damaged`,
          value: row.damaged,
          dec: () => upd('damaged', Math.max(0, row.damaged - 1)),
          inc: () => upd('damaged', Math.min(row.back, row.damaged + 1)),
        },
      ],
      amount: d ? '− ' + formatGhs(d) : '—',
      color: d ? 'var(--red)' : 'var(--mute)',
    };
  });
  const held = Math.min(o.deposit, o.paid);
  const refund = Math.max(0, held - ded);
  const isSuper = me.isSuper;
  return (
    <ModalFrame
      title="Return checklist"
      sub={`${o.ref} · ${o.who}. Count everything with the customer present.`}
      confirm={isSuper ? `Complete and refund ${formatGhs(refund)}` : 'Submit for approval'}
      busy={busy}
      onConfirm={() => {
        if (isSuper && refund > 0 && !pw) return setErrors({ pw: 'Enter your password.' });
        void run(() =>
          returnChecklistAction({
            ref: o.ref,
            rows: Object.entries(rows).map(([itemId, v]) => ({ itemId, back: v.back, damaged: v.damaged })),
            password: isSuper && refund > 0 ? pw : '',
          }),
        );
      }}
    >
      <StepperRows cols={['ITEM', 'RETURNED', 'DAMAGED', 'DEDUCTION']} rows={stepRows} />
      {isSuper && refund > 0 && (
        <FieldGrid>
          <PasswordField value={pw} onChange={setPw} err={errors.pw} hint="Needed because money goes back to the customer." wide />
        </FieldGrid>
      )}
      <Lines
        lines={[
          { k: 'DEPOSIT HELD', v: formatGhs(held) },
          { k: 'DEDUCTIONS', v: '− ' + formatGhs(ded), color: 'var(--red)' },
          { k: 'REFUND TO CUSTOMER', v: formatGhs(refund), color: 'var(--green)', weight: 600 },
        ]}
      />
      <Note>
        {isSuper
          ? 'The refund goes back to the original MoMo or card; desk payments are paid back by hand. Damaged units go to repair.'
          : 'A Super Admin approves the refund in Payments & refunds. Damaged units go to repair.'}
      </Note>
    </ModalFrame>
  );
}

function useLoad<T>(load: () => Promise<T | null>, deps: unknown[]) {
  const [data, setData] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    void load()
      .then((d) => live && setData(d))
      .catch(() => live && setData(null));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

export function OrderDrawer({ spec }: { spec: { ref: string } }) {
  const { version } = useAdmin();
  const actions = useOrderActions();
  const o = useLoad(() => loadOrder(spec.ref), [spec.ref, version]);
  if (o === undefined) return <DrawerLoading label={`Order ${spec.ref}`} />;
  if (o === null) return null;
  return (
    <DrawerFrame
      kicker={o.ref}
      title={o.who}
      status={RENTAL_STATUS[o.status]}
      fields={[
        { k: 'Phone', v: o.phone ? formatPhoneLocal(o.phone) : 'Not given', mono: true },
        ...(o.email ? [{ k: 'Email', v: o.email }] : []),
        { k: 'Occasion', v: o.occasion || '—' },
        { k: 'Dates', v: `${formatDayMonth(o.starts)} → ${formatDayMonth(o.ends)} · ${o.days} day${o.days > 1 ? 's' : ''}` },
        { k: 'Pickup', v: `No. 1 Wisepak Lane, ${formatDayMonth(o.starts)}` },
        { k: 'Return by', v: formatDayMonth(addDays(o.ends, 1)) },
        {
          k: 'Payment',
          v:
            o.paid >= o.total
              ? `Paid${o.method ? ' · ' + o.method : ''}`
              : o.payMode === 'at_pickup'
                ? 'Pay at pickup'
                : 'Waiting for online payment',
        },
      ]}
      sections={[
        { title: 'ITEMS', lines: o.lines.map((l) => ({ k: `${l.name} × ${l.qty}`, v: formatGhs(l.amount) })) },
        {
          title: 'MONEY',
          lines: [
            ...(o.discount ? [{ k: 'PACK DISCOUNT', v: '− ' + formatGhs(o.discount), color: 'var(--green)' }] : []),
            { k: 'SECURITY DEPOSIT', v: formatGhs(o.deposit) },
            { k: 'TOTAL', v: formatGhs(o.total) },
            { k: 'PAID', v: formatGhs(o.paid), color: 'var(--green)' },
            ...(o.returned ? [{ k: 'DEDUCTED ON RETURN', v: formatGhs(o.returned.deduction), color: 'var(--red)' }] : []),
            ...(o.refunded ? [{ k: 'REFUNDED', v: formatGhs(o.refunded), color: 'var(--red)' }] : []),
          ],
        },
      ]}
      note={{ value: o.notes, save: (v) => saveOrderNote(o.ref, v) }}
      actions={[...actions(o, true), invoiceAction('rentals', o.ref, o.paid >= o.total && o.total > 0)]}
    />
  );
}

const STAGES: EnquiryStage[] = ['new', 'quoted', 'deposit_paid', 'done'];

export function EnquiryDrawer({ spec }: { spec: { ref: string } }) {
  const { version, can, openModal, closeDrawer } = useAdmin();
  const e = useLoad(() => loadEnquiry(spec.ref), [spec.ref, version]);
  if (e === undefined) return <DrawerLoading label={`Enquiry ${spec.ref}`} />;
  if (e === null) return null;
  const acts: Action[] = [];
  if (e.stage === 'new' && can('venues.quote'))
    acts.push({
      label: 'Build quote',
      icon: 'file',
      kind: 'primary',
      on: () => {
        closeDrawer();
        openModal(<QuoteModal e={e} />);
      },
    });
  if (e.phone) {
    acts.push({ label: 'Call', icon: 'phone', on: () => (location.href = telHref(e.phone)) });
    acts.push({ label: 'WhatsApp', icon: 'whatsapp', on: () => window.open(whatsappHref(e.phone), '_blank', 'noopener') });
  }
  return (
    <DrawerFrame
      kicker={e.ref}
      title={e.who}
      status={ENQUIRY_STAGE[e.stage]}
      fields={[
        { k: 'Phone', v: e.phone ? formatPhoneLocal(e.phone) : 'Not given', mono: true },
        ...(e.email ? [{ k: 'Email', v: e.email }] : []),
        { k: 'Event', v: e.what || '—' },
        { k: 'Venue', v: e.venue },
        {
          k: 'Date',
          v: new Date(e.date + 'T00:00:00Z').toLocaleDateString('en-GB', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            timeZone: 'UTC',
          }),
        },
        { k: 'Guests', v: String(e.guests) },
        ...(e.quoteTotal != null ? [{ k: 'Quote', v: formatGhs(e.quoteTotal), mono: true }] : []),
        ...(e.message ? [{ k: 'Message', v: e.message }] : []),
      ]}
      note={{ value: e.notes, save: (v) => saveEnquiryNote(e.ref, v) }}
      actions={acts}
    />
  );
}

export function QuoteModal({
  e,
}: {
  e: { ref: string; who: string; what: string; guests: number; date: string; venueSlug: string; venue: string };
}) {
  const { run, busy } = useAction();
  const venuePrice = e.venueSlug === 'compound' ? 250_000 : 80_000;
  const L: [string, string, number, number][] = [
    ['venue', `${e.venue} hire (per day)`, venuePrice, 1],
    ['canopy', 'Canopy', 25_000, e.venueSlug === 'compound' ? Math.ceil(e.guests / 40) : 0],
    ['chair', 'Regular chair', 300, Math.ceil(e.guests / 10) * 10],
    ['setup', 'Set-up crew', 15_000, 1],
  ];
  const [qty, setQty] = useState<Record<string, number>>(Object.fromEntries(L.map(([k, , , q]) => [k, q])));
  const total = L.reduce((t, [k, , price]) => t + (qty[k] ?? 0) * price, 0);
  const rows = L.map(([k, label, price]) => {
    const q = qty[k] ?? 0;
    const step = k === 'chair' ? 10 : 1;
    return {
      label,
      sub: `${formatGhs(price)} each`,
      steppers: [
        {
          label,
          value: q,
          dec: () => setQty((x) => ({ ...x, [k]: Math.max(0, q - step) })),
          inc: () => setQty((x) => ({ ...x, [k]: q + step })),
        },
      ],
      amount: formatGhs(q * price),
    };
  });
  return (
    <ModalFrame
      title={`Quote for ${e.who}`}
      sub={`${e.what || 'Event'} · ${e.guests} guests · ${formatDayMonth(e.date)}`}
      confirm="Save quote"
      busy={busy}
      onConfirm={() => run(() => sendQuoteAction({ ref: e.ref, lines: L.map(([k, label, unit]) => ({ label, qty: qty[k] ?? 0, unit })) }))}
    >
      <StepperRows cols={['LINE', 'QTY', 'AMOUNT']} rows={rows} />
      <Lines
        lines={[
          { k: 'QUOTE TOTAL', v: formatGhs(total), weight: 600 },
          { k: 'DEPOSIT TO CONFIRM (30%)', v: formatGhs(Math.ceil((total * 0.3) / 100) * 100) },
        ]}
      />
      <Note>The enquiry moves to “Quoted”. Call or WhatsApp the customer with the total from the enquiry card.</Note>
    </ModalFrame>
  );
}

export function useEnquiryMoves() {
  const { toast, refresh, openModal, can } = useAdmin();
  return (e: { ref: string; stage: EnquiryStage }) => {
    const i = STAGES.indexOf(e.stage);
    const a: Action[] = [];
    if (!can('venues.pipeline')) return a;
    if (i > 0)
      a.push({
        label: `Move back to ${ENQUIRY_STAGE[STAGES[i - 1]!].toLowerCase()}`,
        icon: 'arrowleft',
        iconOnly: true,
        on: () =>
          openModal(
            <BackModal
              refLabel={e.ref}
              from={ENQUIRY_STAGE[e.stage]}
              to={ENQUIRY_STAGE[STAGES[i - 1]!]}
              onSubmit={(why) => enquiryStageAction(e.ref, STAGES[i - 1]!, why)}
            />,
          ),
      });
    if (i > 0 && i < 3)
      a.push({
        label: `Move to ${ENQUIRY_STAGE[STAGES[i + 1]!].toLowerCase()}`,
        icon: 'arrowright',
        iconOnly: true,
        on: async () => {
          const r = await enquiryStageAction(e.ref, STAGES[i + 1]!);
          toast(r.ok ? r.title : r.error);
          if (r.ok) refresh();
        },
      });
    return a;
  };
}
