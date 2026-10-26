'use client';
// Rental inventory from Admin.dc.html: items with photo, price, deposit, stock
// and repair counts, the add/edit item modal, and free units for ten days.
import { useState } from 'react';
import { signItemUpload } from '@/app/admin/(app)/inventory/actions';
import { repairAction, saveItemAction, setItemImageAction } from '@/app/admin/(app)/rentals/actions';
import type { IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import type { ItemRow } from '@/server/admin/rentals';
import { useAdmin } from '../context';
import { FieldGrid, ModalFrame, TextField } from '../modal';
import { KpiGrid, PageHeader, Tabs, useTab } from '../page-parts';
import { c, col, DataTable } from '../table';
import type { Action } from '../ui';
import { pickFiles, thumb, uploadPhoto } from '../upload';
import { useAction } from '../use-action';

const TABS = ['Items', 'Stock by date'] as const;

type Props = {
  tab: (typeof TABS)[number];
  today: IsoDate;
  items: ItemRow[];
  days?: IsoDate[];
  /** Units on orders keyed "itemId|day". */
  out?: Record<string, number>;
};

const freeToday = (it: ItemRow) => Math.max(0, it.stock - it.repair - it.outToday);
const low = (free: number, stock: number) => free < stock * 0.15;
const dayLabel = (d: IsoDate) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', timeZone: 'UTC' });

export function InventoryView(p: Props) {
  const [tab, setTab] = useTab(TABS, 'Items');
  const { can, openModal } = useAdmin();
  const canEdit = can('inventory.edit');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader
        title="Rental inventory"
        sub={
          canEdit
            ? 'Items, prices, stock and what’s out for repair.'
            : 'Check stock and mark units for repair. Prices are set by a Super Admin.'
        }
        actions={canEdit ? [{ label: 'Add item', icon: 'plus', kind: 'primary', on: () => openModal(<ItemModal item={null} />) }] : []}
      />
      <Tabs list={TABS} cur={tab} set={setTab} label="Inventory views" />
      {p.tab === 'Items' ? (
        <Items items={p.items} canEdit={canEdit} />
      ) : (
        <StockByDate items={p.items} days={p.days ?? []} out={p.out ?? {}} />
      )}
    </div>
  );
}

function Items({ items, canEdit }: { items: ItemRow[]; canEdit: boolean }) {
  const { can, openModal, toast, refresh } = useAdmin();
  const upload = usePhotoUpload();
  const short = items.filter((it) => low(freeToday(it), it.stock));
  const inRepair = items.reduce((t, i) => t + i.repair, 0);
  const repair = (it: ItemRow, delta: 1 | -1) => async () => {
    const r = await repairAction(it.id, delta);
    toast(r.ok ? r.title : r.error, r.ok ? r.body : undefined);
    if (r.ok) refresh();
  };
  return (
    <>
      <KpiGrid
        kpis={[
          {
            label: 'Item types',
            value: String(items.length),
            sub: `${items.reduce((t, i) => t + i.stock, 0).toLocaleString('en-GH')} units owned`,
          },
          { label: 'Out today', value: String(items.reduce((t, i) => t + i.outToday, 0)), sub: 'units on orders' },
          { label: 'In repair', value: String(inRepair), sub: 'units', subColor: inRepair ? 'var(--red)' : undefined },
          {
            label: 'Running low',
            value: String(short.length),
            sub: short.map((i) => i.name).join(', ') || 'Nothing',
            subColor: short.length ? 'var(--amber-ink)' : 'var(--green)',
          },
        ]}
      />
      <DataTable
        title="Items"
        count={String(items.length)}
        minW={860}
        cols={[
          col('PHOTO'),
          col('ITEM'),
          col('PRICE / DAY', 'right'),
          col('DEPOSIT', 'right'),
          col('OWNED', 'right'),
          col('IN REPAIR', 'right'),
          col('FREE TODAY', 'right'),
        ]}
        rows={items.map((it) => {
          const free = freeToday(it);
          const acts: Action[] = [];
          if (can('inventory.repair') && free > 0)
            acts.push({ label: 'Send 1 for repair', icon: 'wrench', iconOnly: true, on: repair(it, 1) });
          if (can('inventory.repair') && it.repair > 0)
            acts.push({ label: '1 back from repair', icon: 'check', iconOnly: true, on: repair(it, -1) });
          if (canEdit) acts.push({ label: 'Edit item', icon: 'edit', iconOnly: true, on: () => openModal(<ItemModal item={it} />) });
          return {
            key: it.id,
            on: canEdit ? () => openModal(<ItemModal item={it} />) : undefined,
            cells: [
              {
                t: '',
                img: {
                  src: it.imageId ? thumb(it.imageId, 160) : null,
                  alt: canEdit ? `Change the photo of ${it.name}` : it.name,
                  onClick: canEdit ? () => upload(it) : undefined,
                },
              },
              c(it.name, undefined, it.spec),
              c(formatGhs(it.price), 'money'),
              c(formatGhs(it.deposit), 'money'),
              c(it.stock, 'num'),
              c(it.repair, 'num'),
              c(free, 'num', low(free, it.stock) ? 'Running low' : undefined),
            ],
            actions: acts,
          };
        })}
        empty={{ icon: 'box', text: 'No items yet', sub: 'Add your first rental item.' }}
      />
    </>
  );
}

function StockByDate({ items, days, out }: { items: ItemRow[]; days: IsoDate[]; out: Record<string, number> }) {
  return (
    <DataTable
      title="Free units by day"
      count="next 10 days"
      minW={900}
      cols={[col('ITEM'), ...days.map((d) => col(dayLabel(d), 'right'))]}
      rows={items.map((it) => ({
        key: it.id,
        cells: [
          c(it.name),
          ...days.map((d) => {
            const free = Math.max(0, it.stock - it.repair - (out[`${it.id}|${d}`] ?? 0));
            const ratio = free / (it.stock || 1);
            return {
              ...c(free, 'num'),
              style: {
                background: ratio < 0.15 ? 'var(--red-bg)' : ratio < 0.6 ? 'var(--chip-bg)' : 'transparent',
                color: ratio < 0.15 ? 'var(--red)' : 'inherit',
              },
            };
          }),
        ],
      }))}
      empty={{ icon: 'box', text: 'No items yet' }}
    />
  );
}

/** Pick a photo and send it to Cloudinary with a server-signed ticket, then point the item at it. */
function usePhotoUpload() {
  const { toast, refresh } = useAdmin();
  return async (it: ItemRow) => {
    const [file] = await pickFiles();
    if (!file) return;
    const up = await uploadPhoto(file, signItemUpload, 1600);
    if ('error' in up) return toast('Photo not saved.', up.error);
    const r = await setItemImageAction(it.id, up.id);
    toast(r.ok ? r.title : r.error, r.ok ? r.body : undefined);
    if (r.ok) refresh();
  };
}

export function ItemModal({ item }: { item: ItemRow | null }) {
  const { run, busy, errors, setErrors } = useAction();
  const [step, setStep] = useState(0);
  const { closeModal } = useAdmin();
  const cedi = (v: number) => String(v / 100);
  const [f, setF] = useState({
    name: item?.name ?? '',
    spec: item?.spec ?? '',
    price: item ? cedi(item.price) : '',
    deposit: item ? cedi(item.deposit) : '',
    stock: item ? String(item.stock) : '',
  });
  const set = (k: keyof typeof f) => (v: string) => {
    setF((x) => ({ ...x, [k]: v }));
    setErrors({ ...errors, [k]: '' });
  };
  const next = () => {
    if (step === 0) {
      if (f.name.trim().length < 2) return setErrors({ name: 'Give the item a name.' });
      setErrors({});
      return setStep(1);
    }
    void run(() => saveItemAction({ id: item?.id ?? null, ...f })).then((r) => {
      // A name error comes back on step one's field.
      if (!r.ok && r.fields?.name) setStep(0);
    });
  };
  return (
    <ModalFrame
      title={item ? 'Edit item' : 'Add a rental item'}
      sub={item ? 'Price changes apply to new reservations only.' : 'It appears on the rentals page as soon as you save.'}
      steps={{ labels: ['Details', 'Price & stock'], idx: step }}
      confirm={step === 0 ? 'Continue' : item ? 'Save item' : 'Add item'}
      onConfirm={next}
      busy={busy}
      secondary={step > 0 ? { label: 'Back', on: () => setStep(0) } : { label: 'Cancel', on: closeModal }}
    >
      <FieldGrid>
        {step === 0 ? (
          <>
            <TextField label="Item name" value={f.name} onChange={set('name')} err={errors.name} />
            <TextField
              label="Short description"
              value={f.spec}
              onChange={set('spec')}
              placeholder="e.g. 10 × 20 ft, white"
              err={errors.spec}
            />
          </>
        ) : (
          <>
            <TextField label="Price per day (GHS)" value={f.price} onChange={set('price')} numeric err={errors.price} />
            <TextField label="Deposit per unit (GHS)" value={f.deposit} onChange={set('deposit')} numeric err={errors.deposit} />
            <TextField label="Units owned" value={f.stock} onChange={set('stock')} numeric err={errors.stock} />
          </>
        )}
      </FieldGrid>
    </ModalFrame>
  );
}
