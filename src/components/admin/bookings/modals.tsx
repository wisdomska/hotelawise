'use client';
// Booking modals from Admin.dc.html: new desk booking (guest → stay → payment),
// record a payment, issue a refund, and "move back" with a reason.
import { useEffect, useState } from 'react';
import {
  createBookingAction,
  loadDeskOptions,
  quoteDesk,
  recordPaymentAction,
  refundBookingAction,
  type undoCheckInAction,
} from '@/app/admin/(app)/bookings/actions';
import { DESK_METHODS, METHOD } from '@/lib/admin/labels';
import { formatDayMonth, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { useAdmin } from '../context';
import { AreaField, DateField, FieldGrid, Lines, ModalFrame, Note, PasswordField, SelectField, TextField } from '../modal';
import { useAction } from '../use-action';

const METHOD_OPTS = DESK_METHODS.map((m) => ({ value: m, label: METHOD[m] }));
const nightsLabel = (n: number) => `${n} night${n > 1 ? 's' : ''}`;

type Variant = { code: string; displayCode: string; name: string; price: number; sleeps: number };

export function QuickBooking({ prefill }: { prefill?: { guest?: string; phone?: string } }) {
  const { closeModal, can, openDrawer } = useAdmin();
  const { run, busy, errors, setErrors } = useAction();
  const [step, setStep] = useState(0);
  const [opts, setOpts] = useState<{ variants: Variant[]; today: IsoDate } | null>(null);
  const [f, setF] = useState({
    guest: prefill?.guest ?? '',
    phone: prefill?.phone ?? '',
    email: '',
    variant: 'STD',
    checkIn: '' as IsoDate | '',
    nights: '1',
    guests: '2',
    room: '',
    source: 'walk_in' as 'walk_in' | 'phone' | 'whatsapp',
    pay: 'cash',
    txn: '',
    pw: '',
  });
  const [quote, setQuote] = useState<{ free: string[]; total: number; checkOut: IsoDate } | null>(null);
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors({ ...errors, [k]: '' });
  };

  useEffect(() => {
    void loadDeskOptions().then((o) => {
      if (!o) return;
      setOpts(o);
      setF((x) => ({ ...x, checkIn: x.checkIn || o.today, variant: o.variants[0]?.code ?? 'STD' }));
    });
  }, []);
  const nights = Math.max(1, Math.floor(Number(f.nights)) || 1);
  useEffect(() => {
    if (!f.checkIn) return;
    let live = true;
    void quoteDesk({ variant: f.variant, checkIn: f.checkIn, nights, guests: Number(f.guests) || 1 }).then((q) => {
      if (!live || !q) return;
      setQuote(q);
      setF((x) => ({ ...x, room: q.free.includes(x.room) ? x.room : (q.free[0] ?? '') }));
    });
    return () => {
      live = false;
    };
  }, [f.variant, f.checkIn, nights, f.guests]);

  const v = opts?.variants.find((x) => x.code === f.variant);
  const unpaid = f.pay === 'none';
  const canTakeMoney = can('bookings.payment.desk');
  const labels = ['Guest', 'Stay', 'Payment'];
  const next = async () => {
    const err: Record<string, string> = {};
    if (step === 0) {
      if (f.guest.trim().length < 2) err.guest = 'Enter the guest’s name.';
      if (f.phone.replace(/\D/g, '').length < 9) err.phone = 'Enter a phone number with at least 9 digits.';
      if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) err.email = 'Check the email address.';
    }
    if (step === 1) {
      if (!quote?.free.length) err.room = 'Pick other dates or another room type.';
      if (v && Number(f.guests) > v.sleeps) err.guests = `${v.name} sleeps ${v.sleeps}.`;
    }
    if (step === 2 && !unpaid) {
      if (f.pay !== 'cash' && f.txn.trim().length < 4) err.txn = 'Enter the transaction ID.';
      if (!f.pw) err.pw = 'Enter your password.';
    }
    if (Object.keys(err).length) return setErrors(err);
    if (step < 2) return setStep(step + 1);
    const r = await run(() =>
      createBookingAction({
        guest: f.guest,
        phone: f.phone,
        email: f.email,
        variant: f.variant,
        checkIn: f.checkIn as IsoDate,
        nights,
        guests: Number(f.guests) || 1,
        room: f.room,
        source: f.source,
        pay: unpaid ? 'none' : (f.pay as (typeof DESK_METHODS)[number]),
        txn: f.txn,
        password: f.pw,
      }),
    );
    if (r.ok && r.data) openDrawer({ kind: 'booking', ref: (r.data as { ref: string }).ref });
    else if (!r.ok && r.fields && Object.keys(r.fields).some((k) => ['guest', 'phone', 'email'].includes(k))) setStep(0);
  };

  const total = quote?.total ?? 0;
  return (
    <ModalFrame
      title="New booking"
      sub="For phone, WhatsApp and walk-in guests. The room comes off the website as soon as you save."
      steps={{ labels, idx: step }}
      confirm={step < 2 ? 'Continue' : `Create booking · ${formatGhs(total)}`}
      onConfirm={next}
      busy={busy}
      secondary={step > 0 ? { label: 'Back', on: () => setStep(step - 1) } : { label: 'Cancel', on: closeModal }}
    >
      {step === 0 && (
        <FieldGrid>
          <TextField label="Guest name" value={f.guest} onChange={set('guest')} placeholder="e.g. Yaw Darko" err={errors.guest} />
          <TextField label="Phone" type="tel" value={f.phone} onChange={set('phone')} placeholder="e.g. 024 412 3456" err={errors.phone} />
          <TextField
            label="Email (optional)"
            type="email"
            value={f.email}
            onChange={set('email')}
            placeholder="name@example.com"
            err={errors.email}
            wide
          />
        </FieldGrid>
      )}
      {step === 1 && (
        <FieldGrid>
          <SelectField
            label="Room type"
            value={f.variant}
            onChange={set('variant')}
            options={(opts?.variants ?? []).map((x) => ({ value: x.code, label: `${x.name} · ${formatGhs(x.price)}` }))}
          />
          <DateField label="Check-in" value={f.checkIn} min={opts?.today} onChange={set('checkIn')} />
          <TextField label="Nights" value={f.nights} onChange={set('nights')} numeric />
          <SelectField
            label="Guests"
            value={f.guests}
            onChange={set('guests')}
            options={['1', '2', '3', '4']}
            hint={v ? `Sleeps up to ${v.sleeps}` : undefined}
            err={errors.guests}
          />
          <SelectField
            label="Room"
            value={quote?.free.length ? f.room : 'None free'}
            onChange={set('room')}
            options={quote?.free.length ? quote.free : ['None free']}
            err={quote && !quote.free.length ? `No ${v?.name ?? ''} rooms are free for these dates.` : errors.room}
            hint={
              quote?.free.length && f.checkIn
                ? `${quote.free.length} free · ${formatDayMonth(f.checkIn)} → ${formatDayMonth(quote.checkOut)}`
                : undefined
            }
          />
        </FieldGrid>
      )}
      {step === 2 && (
        <>
          <FieldGrid>
            <SelectField
              label="Booked by"
              value={f.source}
              onChange={set('source')}
              options={[
                { value: 'walk_in', label: 'Walk-in' },
                { value: 'phone', label: 'Phone' },
                { value: 'whatsapp', label: 'WhatsApp' },
              ]}
            />
            <SelectField
              label="Payment"
              value={f.pay}
              onChange={set('pay')}
              options={[...(canTakeMoney ? METHOD_OPTS : []), { value: 'none', label: 'Not paid yet' }]}
            />
            {!unpaid && f.pay !== 'cash' && (
              <TextField
                label="Transaction ID"
                value={f.txn}
                onChange={set('txn')}
                placeholder="e.g. 8291034475"
                hint="From the MoMo message or card slip"
                err={errors.txn}
              />
            )}
            {!unpaid && <PasswordField value={f.pw} onChange={set('pw')} err={errors.pw} />}
          </FieldGrid>
          <Lines
            lines={[
              { k: `${(v?.name ?? '').toUpperCase()} × ${nightsLabel(nights).toUpperCase()}`, v: formatGhs(total) },
              {
                k: `ROOM ${f.room} · ${f.checkIn ? formatDayMonth(f.checkIn) : ''} → ${quote ? formatDayMonth(quote.checkOut) : ''}`,
                v: '',
                color: 'var(--mute)',
              },
              { k: 'TOTAL', v: formatGhs(total), weight: 600 },
            ]}
          />
        </>
      )}
    </ModalFrame>
  );
}

export function PaymentModal({ b }: { b: { ref: string; guest: string; total: number; paid: number } }) {
  const { run, busy, errors, setErrors } = useAction();
  const bal = b.total - b.paid;
  const [f, setF] = useState({ amount: String(bal / 100), method: 'cash', txn: '', pw: '' });
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors({ ...errors, [k]: '' });
  };
  return (
    <ModalFrame
      title="Record a payment"
      sub={`${b.ref} · ${b.guest} · balance ${formatGhs(bal)}`}
      confirm="Record payment"
      busy={busy}
      onConfirm={() => run(() => recordPaymentAction({ ref: b.ref, amount: f.amount, method: f.method, txn: f.txn, password: f.pw }))}
    >
      <FieldGrid>
        <TextField label="Amount (GHS)" value={f.amount} onChange={set('amount')} numeric placeholder="e.g. 300" err={errors.amount} />
        <SelectField label="Method" value={f.method} onChange={set('method')} options={METHOD_OPTS} />
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
        <PasswordField value={f.pw} onChange={set('pw')} err={errors.pw} />
      </FieldGrid>
      <Note>It shows in the daily cash-up under your name.</Note>
    </ModalFrame>
  );
}

export function RefundModal({ b }: { b: { ref: string; paid: number; refunded: number; refundable: number } }) {
  const { run, busy, errors, setErrors } = useAction();
  const [f, setF] = useState({ amount: '', reason: 'Guest cancelled', pw: '' });
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors({ ...errors, [k]: '' });
  };
  return (
    <ModalFrame
      title="Issue a refund"
      sub={`${b.ref} · paid ${formatGhs(b.paid)}${b.refunded ? `, ${formatGhs(b.refunded)} already refunded` : ''}. It goes back the way they paid.`}
      confirm="Issue refund"
      danger
      busy={busy}
      onConfirm={() => run(() => refundBookingAction({ ref: b.ref, amount: f.amount, reason: f.reason, password: f.pw }))}
    >
      <FieldGrid>
        <TextField
          label="Amount (GHS)"
          value={f.amount}
          onChange={set('amount')}
          numeric
          placeholder="e.g. 300"
          hint={`Up to ${formatGhs(b.refundable)}`}
          err={errors.amount}
        />
        <SelectField
          label="Reason"
          value={f.reason}
          onChange={set('reason')}
          options={['Guest cancelled', 'Overcharged', 'Deposit return', 'Goodwill', 'Other']}
        />
        <PasswordField value={f.pw} onChange={set('pw')} err={errors.pw} wide />
      </FieldGrid>
      <Note>
        Logged with your name, the amount and the reason. Online payments go back through Paystack; cash and desk MoMo are paid back by
        hand.
      </Note>
    </ModalFrame>
  );
}

const BACK_REASONS = ['Marked by mistake', 'Customer changed plans', 'Items not ready yet', 'Payment problem', 'Other'];

/** "Move back" a step with a reason that goes into the audit log. */
export function BackModal({
  refLabel,
  from,
  to,
  onSubmit,
}: {
  refLabel: string;
  from: string;
  to: string;
  onSubmit: (reason: string) => ReturnType<typeof undoCheckInAction>;
}) {
  const { run, busy, errors, setErrors } = useAction();
  const [reason, setReason] = useState(BACK_REASONS[0]!);
  const [note, setNote] = useState('');
  const other = reason === 'Other';
  return (
    <ModalFrame
      title={`Move ${refLabel} back?`}
      sub={`From "${from}" to "${to}". The reason is saved in the audit log.`}
      confirm={`Move back to ${to.toLowerCase()}`}
      busy={busy}
      onConfirm={() => {
        if (other && note.trim().length < 5) return setErrors({ note: 'Tell us what happened (a few words is enough).' });
        void run(() => onSubmit(reason + (note.trim() ? `: ${note.trim()}` : '')));
      }}
    >
      <FieldGrid>
        <SelectField label="Why?" value={reason} onChange={setReason} options={BACK_REASONS} wide />
        <AreaField
          label={other ? 'Details' : 'Details (optional)'}
          value={note}
          onChange={setNote}
          placeholder="What happened?"
          err={errors.note}
          wide
        />
      </FieldGrid>
    </ModalFrame>
  );
}
