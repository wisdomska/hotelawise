'use client';
// Rooms & rates (Admin.dc.html screen "rooms"): room status board, room types
// and prices, rate rules, promo codes, blocked dates and stay policies.
import {
  deletePromoAction,
  deleteRuleAction,
  savePoliciesAction,
  togglePromoAction,
  toggleRuleAction,
  unblockAction,
} from '@/app/admin/(app)/rooms/actions';
import { ROOM_STATUS, type RoomStatus } from '@/lib/admin/labels';
import { formatDayMonth, todayInAccra } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import type { RoomTile } from '@/server/admin/bookings';
import type { RoomTypeRow } from '@/server/admin/rates';
import { useAdmin } from '../context';
import { ConfirmModal } from '../modal';
import { KpiGrid, PageHeader, Tabs, useTab, type TabDef } from '../page-parts';
import { SettingsForm } from '../settings-form';
import { c, col, DataTable, type Row } from '../table';
import { chip, mono, statusTone, type Action } from '../ui';
import { AddRoomModal, BlackoutModal, PromoModal, roomsLabel, RoomTypeModal, RuleModal, type PromoSpec, type RuleSpec } from './modals';

type Props = {
  canEdit: boolean;
  board: RoomTile[];
  types: RoomTypeRow[];
  rules: (RuleSpec & { active: boolean })[];
  promos: (PromoSpec & { active: boolean; usedCount: number })[];
  blackouts: { id: string; starts: string; ends: string; rooms: string[] | null; reason: string }[];
  policies: Record<string, string>;
};

const md = (v: string | null) =>
  v ? new Date(`2000-${v}T00:00:00Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short' }) : '';
const ruleWhen = (r: RuleSpec) =>
  r.kind === 'weekend'
    ? 'Fri and Sat nights'
    : r.kind === 'longstay'
      ? `Stays of ${r.minNights}+ nights`
      : (r.monthDayFrom === r.monthDayTo ? md(r.monthDayFrom) : `${md(r.monthDayFrom)} – ${md(r.monthDayTo)}`) + ', every year';
const ruleChange = (r: RuleSpec) =>
  (r.direction === 'down' ? '−' : '+') + (r.unit === 'pct' ? `${r.amount}%` : `${formatGhs(r.amount)} a night`);
const promoWhat = (p: PromoSpec) =>
  p.type === 'pct' ? `${p.value}% off the room` : p.type === 'ghs' ? `${formatGhs(p.value)} off` : 'Free breakfast';

export function RoomsView(p: Props) {
  const { openModal, openDrawer, toast, refresh } = useAdmin();
  const today = todayInAccra();
  const upcoming = p.blackouts.filter((b) => b.ends >= today).length;
  const TABS: TabDef[] = ['Room status', 'Room types', 'Rate rules', 'Promo codes', ['Blocked dates', upcoming], 'Policies'];
  const [tab, setTab] = useTab(TABS, 'Room status');
  const sup = p.canEdit;
  const quick = (fn: () => Promise<{ ok: boolean; title?: string; body?: string; error?: string }>) => async () => {
    const r = await fn();
    toast(r.ok ? (r.title ?? 'Done.') : (r.error ?? 'That didn’t work.'), r.ok ? r.body : undefined);
    if (r.ok) refresh();
  };
  const confirm = (title: string, sub: string, label: string, run: () => ReturnType<typeof unblockAction>) => () =>
    openModal(<ConfirmModal title={title} sub={sub} confirm={label} run={run} />);

  const std = p.types.find((t) => t.code === 'STD') ?? p.types[0];
  const example = { name: std?.name ?? 'Standard', price: std?.price ?? 0 };
  const parentOf = (t: RoomTypeRow) => p.types.find((x) => !x.tier && t.code.startsWith(x.code));
  const typeSpec = (t: RoomTypeRow) => ({
    ...t,
    parent: t.tier ? parentOf(t)?.name : undefined,
    sharedWith: t.tier ? undefined : p.types.find((x) => x.tier && x.code.startsWith(t.code))?.name,
  });

  let actions: Action[] = [];
  if (sup && tab === 'Room status')
    actions = [
      { label: 'Add room', icon: 'plus', kind: 'primary', hint: 'A new room, or one coming back', on: () => openModal(<AddRoomModal />) },
    ];
  if (sup && tab === 'Rate rules')
    actions = [
      {
        label: 'New rule',
        icon: 'plus',
        kind: 'primary',
        hint: 'Raise or lower prices on certain nights',
        on: () => openModal(<RuleModal r={null} example={example} />),
      },
    ];
  if (sup && tab === 'Promo codes')
    actions = [
      {
        label: 'New promo code',
        icon: 'plus',
        kind: 'primary',
        hint: 'Guests type the code at checkout',
        on: () => openModal(<PromoModal p={null} />),
      },
    ];
  if (sup && tab === 'Blocked dates')
    actions = [{ label: 'Block dates', icon: 'plus', kind: 'primary', on: () => openModal(<BlackoutModal />) }];

  const counts = (st: string) => p.board.filter((r) => r.status === st || (st === 'maintenance' && r.status === 'out_of_order')).length;

  return (
    <>
      <PageHeader
        title="Rooms & rates"
        sub={sup ? 'Room status, prices and booking rules.' : 'You can change a room’s status. Prices and rules are set by a Super Admin.'}
        actions={actions}
      />
      <Tabs list={TABS} cur={tab} set={setTab} label="Rooms & rates" />

      {tab === 'Room status' && (
        <>
          <KpiGrid
            kpis={(['available', 'occupied', 'cleaning', 'maintenance'] as const).map((st) => ({
              label: ROOM_STATUS[st],
              value: String(counts(st)),
              sub: 'rooms',
            }))}
          />
          <div style={{ fontSize: 12, color: 'var(--mute)' }}>Click a room to see its guest, upcoming stays and to change its status.</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 8 }} data-stagger="">
            {p.board.map((r) => {
              const label = ROOM_STATUS[r.status as RoomStatus] ?? r.status;
              const line = r.guest
                ? `${r.guest} · leaves ${r.leaves ? formatDayMonth(r.leaves) : ''}`
                : r.status === 'available'
                  ? 'Ready for guests'
                  : r.status === 'cleaning'
                    ? 'Being cleaned'
                    : 'Not available';
              return (
                <button
                  key={r.number}
                  type="button"
                  className="aw-tile"
                  onClick={() => openDrawer({ kind: 'room', number: r.number })}
                  style={{
                    padding: 12,
                    borderRadius: 12,
                    background: 'var(--panel)',
                    border: '1px solid var(--line)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 10,
                    textAlign: 'left',
                  }}
                >
                  <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', width: '100%' }}>
                    <span style={{ fontFamily: mono, fontSize: 18, fontWeight: 500 }}>
                      <span className="sr-only">Room </span>
                      {r.number}
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: 'var(--mute)' }}>{r.code}</span>
                  </span>
                  <span style={chip(statusTone(label))}>{label}</span>
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--mute)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      width: '100%',
                    }}
                  >
                    {line}
                  </span>
                  <span className="sr-only">Open details</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {tab === 'Room types' && (
        <DataTable
          title="Room types"
          count={`${p.types.length} types`}
          minW={780}
          cols={[col('CODE'), col('NAME'), col('ROOM NOS.'), col('SLEEPS', 'right'), col('BEDS'), col('PER NIGHT', 'right')]}
          rows={p.types.map<Row>((t) => {
            const open = () => openModal(<RoomTypeModal t={typeSpec(t)} />);
            return {
              key: t.code,
              on: sup ? open : undefined,
              cells: [
                c(t.displayCode, 'chip', undefined, 'mid'),
                c(t.name, undefined, t.tier ? `Bigger tier of ${parentOf(t)?.name ?? ''}` : t.bathroom),
                c(t.numbers.join(', '), 'mono'),
                c(t.sleeps, 'num'),
                c(t.beds),
                c(formatGhs(t.price), 'money'),
              ],
              actions: sup ? [{ label: 'Edit room details and price', icon: 'edit', iconOnly: true, on: open }] : [],
            };
          })}
        />
      )}

      {tab === 'Rate rules' && (
        <DataTable
          title="Rate rules"
          count={`${p.rules.filter((r) => r.active).length} active`}
          minW={780}
          empty={{ icon: 'tag', text: 'No rate rules yet', sub: 'Rules raise or lower the nightly price on certain dates.' }}
          cols={[col('RULE'), col('WHEN'), col('ROOMS'), col('CHANGE', 'right'), col('STATUS')]}
          rows={p.rules.map<Row>((r) => {
            const open = () => openModal(<RuleModal r={r} example={example} />);
            return {
              key: r.id,
              on: sup ? open : undefined,
              cells: [
                c(r.name),
                c(ruleWhen(r)),
                c(roomsLabel(r.appliesTo?.[0])),
                c(ruleChange(r), 'num'),
                c(r.active ? 'Active' : 'Paused', 'chip'),
              ],
              actions: sup
                ? [
                    { label: 'Edit rule', icon: 'edit', iconOnly: true, on: open },
                    {
                      label: r.active ? 'Pause rule' : 'Turn rule on',
                      icon: r.active ? 'pause' : 'play',
                      iconOnly: true,
                      on: quick(() => toggleRuleAction(r.id)),
                    },
                    {
                      label: 'Delete rule',
                      icon: 'trash',
                      kind: 'danger',
                      iconOnly: true,
                      on: confirm(
                        `Delete "${r.name}"?`,
                        'Prices go back to normal on those nights. Existing bookings keep their price.',
                        'Delete rule',
                        () => deleteRuleAction(r.id),
                      ),
                    },
                  ]
                : [],
            };
          })}
        />
      )}

      {tab === 'Promo codes' && (
        <DataTable
          title="Promo codes"
          count={`${p.promos.filter((x) => x.active && !(x.endsOn && x.endsOn < today)).length} active`}
          minW={820}
          empty={{ icon: 'tag', text: 'No promo codes yet', sub: 'Create one and share it with guests.' }}
          cols={[col('CODE'), col('DISCOUNT'), col('VALID'), col('ROOMS'), col('USED', 'right'), col('STATUS')]}
          rows={p.promos.map<Row>((x) => {
            const expired = !!x.endsOn && x.endsOn < today;
            const st = expired ? 'Expired' : x.active ? 'Active' : 'Paused';
            const open = () => openModal(<PromoModal p={x} />);
            return {
              key: x.id,
              on: sup ? open : undefined,
              cells: [
                c(x.code, 'mono'),
                c(promoWhat(x), undefined, x.minNights ? `${x.minNights}+ nights` : undefined),
                c(x.endsOn ? `${expired ? 'Ended' : 'Until'} ${formatDayMonth(x.endsOn)}` : 'No end date', 'mono'),
                c(roomsLabel(x.appliesTo)),
                c(x.usedCount, 'num'),
                c(st, 'chip'),
              ],
              actions: sup
                ? [
                    { label: 'Edit code', icon: 'edit', iconOnly: true, on: open },
                    ...(!expired
                      ? [
                          {
                            label: x.active ? 'Pause code' : 'Turn code on',
                            icon: x.active ? ('pause' as const) : ('play' as const),
                            iconOnly: true,
                            on: quick(() => togglePromoAction(x.id)),
                          },
                        ]
                      : []),
                    {
                      label: 'Delete code',
                      icon: 'trash',
                      kind: 'danger',
                      iconOnly: true,
                      on: confirm(
                        `Delete ${x.code}?`,
                        'Guests won’t be able to use it. Bookings that already used it are not affected.',
                        'Delete code',
                        () => deletePromoAction(x.id),
                      ),
                    },
                  ]
                : [],
            };
          })}
        />
      )}

      {tab === 'Blocked dates' && (
        <DataTable
          title="Blocked dates"
          count={String(p.blackouts.length)}
          minW={600}
          empty={{ icon: 'calendar', text: 'No blocked dates', sub: 'Every night can be booked online.' }}
          cols={[col('DATES'), col('ROOMS'), col('REASON')]}
          rows={p.blackouts.map<Row>((b) => ({
            key: b.id,
            cells: [
              c(
                b.starts === b.ends ? formatDayMonth(b.starts) : `${formatDayMonth(b.starts)} → ${formatDayMonth(b.ends)}`,
                'mono',
                b.ends < today ? 'Past' : undefined,
              ),
              c(b.rooms ? `Room ${b.rooms.join(', ')}` : 'All rooms'),
              c(b.reason, 'wrap'),
            ],
            actions: sup
              ? [
                  {
                    label: 'Unblock',
                    icon: 'trash',
                    kind: 'danger',
                    iconOnly: true,
                    on: confirm('Unblock these dates?', 'They can be booked online again straight away.', 'Unblock', () =>
                      unblockAction(b.id),
                    ),
                  },
                ]
              : [],
          }))}
        />
      )}

      {tab === 'Policies' && (
        <SettingsForm
          title="Stay policies"
          note={sup ? 'Shown on the website and on every confirmation.' : 'Read only. Ask a Super Admin to change these.'}
          readOnly={!sup}
          values={p.policies}
          fields={[
            { key: 'hotel.checkIn', label: 'Check-in from', kind: 'text', mono: true },
            { key: 'hotel.checkOut', label: 'Check-out by', kind: 'text', mono: true },
            { key: 'booking.depositPercent', label: 'Online deposit (%)', kind: 'text', mono: true },
            { key: 'booking.policyText', label: 'Cancellation policy', kind: 'area', wide: true },
          ]}
          save={savePoliciesAction}
        />
      )}
    </>
  );
}
