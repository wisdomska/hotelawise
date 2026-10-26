'use client';
// Rooms & rates modals from Admin.dc.html buildModal: room type, rate rule,
// promo code and blocked dates, plus adding a room and changing its type.
import { useEffect, useState } from 'react';
import {
  addRoomAction,
  blockDatesAction,
  changeRoomTypeAction,
  loadRoomNumbers,
  loadRoomTypeOptions,
  savePromoAction,
  saveRoomTypeAction,
  saveRuleAction,
} from '@/app/admin/(app)/rooms/actions';
import { todayInAccra, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { useAdmin } from '../context';
import { AreaField, DateField, FieldGrid, Lines, ModalFrame, Note, SelectField, TextField } from '../modal';
import { useAction } from '../use-action';

export const ROOM_OPTS = [
  { value: 'all', label: 'All rooms' },
  { value: 'STD', label: 'Standard' },
  { value: 'EXE', label: 'Executive & Executive Plus' },
  { value: 'VIP', label: 'VIP' },
  { value: 'DBL', label: 'Double' },
];
export const roomsLabel = (v: string | null | undefined) => ROOM_OPTS.find((o) => o.value === (v ?? 'all'))?.label ?? v ?? 'All rooms';

function useForm<T extends Record<string, string>>(init: T) {
  const { run, busy, errors, setErrors } = useAction();
  const [f, setF] = useState(init);
  const set = (k: keyof T) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    if (errors[k as string]) setErrors({ ...errors, [k]: '' });
  };
  return { f, set, run, busy, errors, setErrors };
}

export type RoomTypeSpec = {
  code: string;
  name: string;
  note: string | null;
  price: number;
  sleeps: number;
  beds: string;
  bathroom: string;
  bestFor: string;
  amenities: string[];
  tier: boolean;
  /** The name of the variant a tier borrows its details from. */
  parent?: string;
  sharedWith?: string;
};

export function RoomTypeModal({ t }: { t: RoomTypeSpec }) {
  const { closeModal } = useAdmin();
  const [step, setStep] = useState(0);
  const { f, set, run, busy, errors, setErrors } = useForm({
    name: t.name,
    note: t.note ?? '',
    price: String(t.price / 100),
    beds: t.beds,
    sleeps: String(t.sleeps),
    bathroom: t.bathroom,
    bestFor: t.bestFor,
    amenities: t.amenities.join('\n'),
  });
  const save = () => run(() => saveRoomTypeAction({ code: t.code, tier: t.tier, ...f }));
  const priceErr = Math.round(Number(f.price)) > 0 ? '' : 'Enter a price above 0.';
  if (t.tier)
    return (
      <ModalFrame
        title={`Edit ${t.name}`}
        sub={`A bigger tier of the ${t.parent ?? 'Executive'} room. Beds, amenities and photos come from ${t.parent ?? 'Executive'}.`}
        confirm="Save"
        busy={busy}
        onConfirm={() => {
          const err: Record<string, string> = {};
          if (f.name.trim().length < 2) err.name = 'Give it a name.';
          if (priceErr) err.price = priceErr;
          if (Object.keys(err).length) return setErrors(err);
          void save();
        }}
      >
        <FieldGrid>
          <TextField label="Name" value={f.name} onChange={set('name')} err={errors.name} />
          <TextField label="Short line under the name" value={f.note} onChange={set('note')} />
          <TextField label="Price per night (GHS)" value={f.price} onChange={set('price')} numeric err={errors.price} />
        </FieldGrid>
      </ModalFrame>
    );
  return (
    <ModalFrame
      title={`Edit ${t.name} room`}
      sub={
        t.sharedWith
          ? `${t.sharedWith} shares these details. Photos are in Content › Photos.`
          : 'Changes show on the website and checkout straight away. Photos are in Content › Photos.'
      }
      steps={{ labels: ['Details', 'Amenities & price'], idx: step }}
      confirm={step === 0 ? 'Continue' : 'Save room'}
      busy={busy}
      secondary={step > 0 ? { label: 'Back', on: () => setStep(0) } : { label: 'Cancel', on: closeModal }}
      onConfirm={() => {
        const err: Record<string, string> = {};
        if (step === 0) {
          if (f.name.trim().length < 2) err.name = 'Give the room a name.';
          if (!f.beds.trim()) err.beds = 'Describe the beds.';
          if (!f.bathroom.trim()) err.bathroom = 'Describe the bathroom.';
          if (Object.keys(err).length) return setErrors(err);
          return setStep(1);
        }
        if (!f.amenities.split('\n').some((x) => x.trim())) err.amenities = 'Add at least one amenity.';
        if (priceErr) err.price = priceErr;
        if (Object.keys(err).length) return setErrors(err);
        void save().then((r) => {
          if (!r.ok && r.fields && ['name', 'beds', 'bathroom'].some((k) => r.fields![k])) setStep(0);
        });
      }}
    >
      {step === 0 ? (
        <FieldGrid>
          <TextField label="Name" value={f.name} onChange={set('name')} placeholder="e.g. Standard" err={errors.name} />
          <TextField label="Beds" value={f.beds} onChange={set('beds')} placeholder="e.g. 1 queen bed" err={errors.beds} />
          <SelectField label="Sleeps" value={f.sleeps} onChange={set('sleeps')} options={['1', '2', '3', '4', '5', '6']} />
          <TextField
            label="Bathroom"
            value={f.bathroom}
            onChange={set('bathroom')}
            placeholder="e.g. Private shower room"
            err={errors.bathroom}
          />
          <TextField label="Best for" value={f.bestFor} onChange={set('bestFor')} placeholder="e.g. Solo trips, short stays" wide />
        </FieldGrid>
      ) : (
        <FieldGrid>
          <AreaField
            label="Amenities"
            value={f.amenities}
            onChange={set('amenities')}
            placeholder={'Air-conditioning\nWi-Fi\nFlat-screen TV'}
            hint="One per line. Shown on the room page."
            err={errors.amenities}
            rows={6}
            wide
          />
          <TextField label="Price per night (GHS)" value={f.price} onChange={set('price')} numeric err={errors.price} />
        </FieldGrid>
      )}
    </ModalFrame>
  );
}

export type RuleSpec = {
  id: string;
  name: string;
  kind: 'range' | 'weekend' | 'longstay';
  monthDayFrom: string | null;
  monthDayTo: string | null;
  minNights: number | null;
  appliesTo: string[] | null;
  direction: 'up' | 'down';
  unit: 'pct' | 'ghs';
  amount: number;
};

export function RuleModal({ r, example }: { r: RuleSpec | null; example: { name: string; price: number } }) {
  const { closeModal } = useAdmin();
  const [step, setStep] = useState(0);
  const Y = todayInAccra().slice(0, 4);
  const { f, set, run, busy, errors, setErrors } = useForm({
    name: r?.name ?? '',
    kind: r?.kind ?? 'range',
    from: r?.monthDayFrom ? `${Y}-${r.monthDayFrom}` : '',
    to: r?.monthDayTo ? `${Y}-${r.monthDayTo}` : '',
    minNights: String(r?.minNights ?? 7),
    rooms: r?.appliesTo?.[0] ?? 'all',
    direction: r?.direction ?? 'up',
    unit: r?.unit ?? 'pct',
    amount: r ? String(r.unit === 'ghs' ? r.amount / 100 : r.amount) : '',
  });
  const amt = Number(f.amount) || 0;
  const delta = f.unit === 'pct' ? Math.round((example.price * amt) / 100) : amt * 100;
  const after = Math.max(0, example.price + (f.direction === 'down' ? -delta : delta));
  return (
    <ModalFrame
      title={r ? 'Edit rate rule' : 'New rate rule'}
      sub="Rules change the nightly price on the website and checkout automatically."
      steps={{ labels: ['When', 'Price change'], idx: step }}
      confirm={step === 0 ? 'Continue' : 'Save rule'}
      busy={busy}
      secondary={step > 0 ? { label: 'Back', on: () => setStep(0) } : { label: 'Cancel', on: closeModal }}
      onConfirm={() => {
        if (step === 0) {
          const err: Record<string, string> = {};
          if (f.name.trim().length < 2) err.name = 'Give the rule a name.';
          if (f.kind === 'longstay' && !(Math.floor(Number(f.minNights)) >= 2)) err.minNights = 'Enter 2 nights or more.';
          if (f.kind === 'range' && !f.from) err.from = 'Pick a date.';
          if (f.kind === 'range' && !f.to) err.to = 'Pick a date.';
          if (Object.keys(err).length) return setErrors(err);
          return setStep(1);
        }
        void run(() => saveRuleAction({ id: r?.id ?? null, ...f })).then((res) => {
          if (!res.ok && res.fields && ['name', 'from', 'to', 'minNights'].some((k) => res.fields![k])) setStep(0);
        });
      }}
    >
      {step === 0 ? (
        <FieldGrid>
          <TextField label="Rule name" value={f.name} onChange={set('name')} placeholder="e.g. Easter weekend" err={errors.name} wide />
          <SelectField
            label="When does it apply?"
            value={f.kind}
            onChange={set('kind')}
            wide
            options={[
              { value: 'range', label: 'On set dates, every year' },
              { value: 'weekend', label: 'Every Friday and Saturday night' },
              { value: 'longstay', label: 'When guests stay longer' },
            ]}
          />
          {f.kind === 'range' && (
            <>
              <DateField label="From" value={f.from} onChange={set('from')} min={`${Y}-01-01`} err={errors.from} />
              <DateField label="To" value={f.to} onChange={set('to')} min={`${Y}-01-01`} hint="Can run past New Year." err={errors.to} />
            </>
          )}
          {f.kind === 'longstay' && (
            <TextField label="Minimum nights" value={f.minNights} onChange={set('minNights')} numeric err={errors.minNights} />
          )}
        </FieldGrid>
      ) : (
        <>
          <FieldGrid>
            <SelectField label="Which rooms?" value={f.rooms} onChange={set('rooms')} options={ROOM_OPTS} wide />
            <SelectField
              label="Raise or lower?"
              value={f.direction}
              onChange={set('direction')}
              options={[
                { value: 'up', label: 'Raise the price' },
                { value: 'down', label: 'Lower the price' },
              ]}
            />
            <SelectField
              label="By"
              value={f.unit}
              onChange={set('unit')}
              options={[
                { value: 'pct', label: 'A percentage' },
                { value: 'ghs', label: 'An amount (GHS a night)' },
              ]}
            />
            <TextField
              label={f.unit === 'pct' ? 'Percentage' : 'Amount (GHS)'}
              value={f.amount}
              onChange={set('amount')}
              numeric
              err={errors.amount}
            />
          </FieldGrid>
          {amt > 0 && (
            <Lines
              lines={[
                {
                  k: `EXAMPLE · ${example.name.toUpperCase()} AT ${formatGhs(example.price)}`,
                  v: `${formatGhs(after)} a night`,
                  weight: 500,
                },
              ]}
            />
          )}
        </>
      )}
    </ModalFrame>
  );
}

export type PromoSpec = {
  id: string;
  code: string;
  type: 'pct' | 'ghs' | 'breakfast';
  value: number;
  endsOn: string | null;
  appliesTo: string | null;
  minNights: number | null;
};

export function PromoModal({ p }: { p: PromoSpec | null }) {
  const { closeModal } = useAdmin();
  const [step, setStep] = useState(0);
  const { f, set, run, busy, errors, setErrors } = useForm({
    code: p?.code ?? '',
    type: p?.type ?? 'pct',
    value: p ? String(p.type === 'ghs' ? p.value / 100 : p.value) : '',
    ends: p?.endsOn ? 'date' : p ? 'never' : 'date',
    until: p?.endsOn ?? '',
    rooms: p?.appliesTo ?? 'all',
    minNights: String(p?.minNights ?? 0),
  });
  return (
    <ModalFrame
      title={p ? 'Edit promo code' : 'New promo code'}
      sub="Guests enter the code at checkout. It works straight away."
      steps={{ labels: ['Code', 'Limits'], idx: step }}
      confirm={step === 0 ? 'Continue' : 'Save code'}
      busy={busy}
      secondary={step > 0 ? { label: 'Back', on: () => setStep(0) } : { label: 'Cancel', on: closeModal }}
      onConfirm={() => {
        if (step === 0) {
          const err: Record<string, string> = {};
          const code = f.code.trim().toUpperCase();
          if (!/^[A-Z0-9]{3,12}$/.test(code)) err.code = 'Use 3 to 12 letters or numbers, no spaces.';
          if (f.type !== 'breakfast') {
            const v = Number(f.value);
            if (!(v > 0)) err.value = 'Enter a number above 0.';
            else if (f.type === 'pct' && v > 90) err.value = 'Keep it at 90% or less.';
          }
          if (Object.keys(err).length) return setErrors(err);
          set('code')(code);
          return setStep(1);
        }
        void run(() => savePromoAction({ id: p?.id ?? null, ...f })).then((r) => {
          if (!r.ok && r.fields && ['code', 'value'].some((k) => r.fields![k])) setStep(0);
        });
      }}
    >
      {step === 0 ? (
        <FieldGrid>
          <TextField
            label="Code"
            value={f.code}
            onChange={set('code')}
            hint="Letters and numbers, 3 to 12 characters. Guests type this at checkout."
            err={errors.code}
            wide
          />
          <SelectField
            label="Discount"
            value={f.type}
            onChange={set('type')}
            options={[
              { value: 'pct', label: 'Percentage off the room' },
              { value: 'ghs', label: 'Amount off (GHS)' },
              { value: 'breakfast', label: 'Free breakfast' },
            ]}
          />
          {f.type !== 'breakfast' && (
            <TextField
              label={f.type === 'pct' ? 'Percentage' : 'Amount (GHS)'}
              value={f.value}
              onChange={set('value')}
              numeric
              err={errors.value}
            />
          )}
        </FieldGrid>
      ) : (
        <FieldGrid>
          <SelectField
            label="Ends"
            value={f.ends}
            onChange={set('ends')}
            options={[
              { value: 'date', label: 'On a date' },
              { value: 'never', label: 'No end date' },
            ]}
          />
          {f.ends === 'date' && (
            <DateField label="Last day" value={f.until} onChange={set('until')} min={todayInAccra()} err={errors.until} />
          )}
          <SelectField label="Which rooms?" value={f.rooms} onChange={set('rooms')} options={ROOM_OPTS} />
          <TextField
            label="Minimum nights"
            value={f.minNights}
            onChange={set('minNights')}
            numeric
            hint="0 means any stay."
            err={errors.minNights}
          />
        </FieldGrid>
      )}
    </ModalFrame>
  );
}

export function BlackoutModal() {
  const today = todayInAccra();
  const [rooms, setRooms] = useState<string[]>([]);
  const { f, set, run, busy, errors, setErrors } = useForm({ from: today as string, to: today as string, room: 'all', reason: '' });
  useEffect(() => {
    void loadRoomNumbers().then((r) => setRooms(r ?? []));
  }, []);
  return (
    <ModalFrame
      title="Block dates"
      sub="Blocked nights can’t be booked online. Existing bookings are not affected."
      confirm="Block dates"
      busy={busy}
      onConfirm={() => {
        const err: Record<string, string> = {};
        if (f.to < f.from) err.to = 'End date must be on or after the start.';
        if (!f.reason.trim()) err.reason = 'Add a short reason.';
        if (Object.keys(err).length) return setErrors(err);
        void run(() => blockDatesAction(f));
      }}
    >
      <FieldGrid>
        <DateField label="From" value={f.from as IsoDate} onChange={set('from')} min={today} err={errors.from} />
        <DateField label="To" value={f.to as IsoDate} onChange={set('to')} min={f.from} err={errors.to} />
        <SelectField
          label="Rooms"
          value={f.room}
          onChange={set('room')}
          options={[{ value: 'all', label: 'All rooms' }, ...rooms.map((n) => ({ value: n, label: `Room ${n}` }))]}
        />
        <TextField label="Reason" value={f.reason} onChange={set('reason')} placeholder="e.g. Repainting" err={errors.reason} />
      </FieldGrid>
    </ModalFrame>
  );
}

function useRoomTypes() {
  const [o, setO] = useState<{ types: { value: string; label: string }[]; removed: string[] } | null>(null);
  useEffect(() => {
    void loadRoomTypeOptions().then((x) => setO(x));
  }, []);
  return o;
}

export function AddRoomModal() {
  const o = useRoomTypes();
  const { f, set, run, busy, errors, setErrors } = useForm({ number: '', type: '' });
  const type = f.type || o?.types[0]?.value || '';
  return (
    <ModalFrame
      title="Add a room"
      sub="It goes on the room board and can be booked on the website straight away, at its type’s price."
      confirm="Add room"
      busy={busy}
      onConfirm={() => {
        if (!f.number.trim()) return setErrors({ number: 'Enter the room number.' });
        void run(() => addRoomAction({ number: f.number, type }));
      }}
    >
      <FieldGrid>
        <TextField label="Room number" value={f.number} onChange={set('number')} placeholder="e.g. 209" err={errors.number} />
        <SelectField label="Room type" value={type} onChange={set('type')} options={o?.types ?? []} err={errors.type} />
      </FieldGrid>
      {!!o?.removed.length && <Note>Removed rooms you can bring back by adding the number again: {o.removed.join(', ')}.</Note>}
    </ModalFrame>
  );
}

export function ChangeRoomTypeModal({ number, current }: { number: string; current: string }) {
  const o = useRoomTypes();
  const { f, set, run, busy } = useForm({ type: current });
  return (
    <ModalFrame
      title={`Change room ${number}’s type`}
      sub="The room takes the new type’s price and details. Not possible while it has a guest or upcoming stays."
      confirm="Change type"
      busy={busy}
      onConfirm={() => void run(() => changeRoomTypeAction(number, f.type))}
    >
      <FieldGrid>
        <SelectField label="Room type" value={f.type} onChange={set('type')} options={o?.types ?? []} wide />
      </FieldGrid>
    </ModalFrame>
  );
}
