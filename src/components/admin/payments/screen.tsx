'use client';
// Payments & refunds (Admin.dc.html screen "payments"): money in, the refunds
// queue, deposits held and the day's cash-up.
import { useState } from 'react';
import { approveRefundAction, rejectRefundAction } from '@/app/admin/(app)/payments/actions';
import { formatDayMonth, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import type { CashUpRow, DepositRow, RefundRow, TxFilter, TxRow } from '@/server/admin/payments';
import { useAdmin } from '../context';
import { ConfirmModal, FieldGrid, Lines, ModalFrame, Note, PasswordField } from '../modal';
import { KpiGrid, PageHeader, Tabs, useTab, type TabDef } from '../page-parts';
import { c, col, DataTable, type Row } from '../table';
import type { Action } from '../ui';
import { useAction } from '../use-action';
import { download, useHref } from './use-href';

type Props = {
  today: IsoDate;
  day: IsoDate;
  filter: TxFilter;
  kpis: { desk: number; online: number; deposits: { n: number; held: number }; refunds: { n: number; owed: number } };
  tx: { rows: TxRow[]; total: number; page: number };
  refunds: { rows: RefundRow[]; total: number; page: number };
  deposits: DepositRow[];
  cash: CashUpRow[];
};

const FILTER_LABEL: Record<TxFilter, string> = {
  all: 'All',
  rooms: 'Rooms',
  rentals: 'Rentals',
  venues: 'Venues',
  paystack: 'Paystack',
  desk: 'Desk',
};

const longDay = (d: IsoDate) =>
  new Date(d + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' });

export function PaymentsScreen(p: Props) {
  const { can, openDrawer, openModal } = useAdmin();
  const href = useHref();
  const TABS: TabDef[] = ['Transactions', ['Refunds', p.kpis.refunds.n], 'Deposits held', 'Cash-up'];
  const [tab, setTab] = useTab(TABS, 'Transactions');
  const open = (kind: TxRow['kind'], ref: string) =>
    kind === 'booking'
      ? openDrawer({ kind: 'booking', ref })
      : kind === 'rental'
        ? openDrawer({ kind: 'rental', ref })
        : openDrawer({ kind: 'enquiry', ref });

  const actions: Action[] = can('exports.download')
    ? [
        {
          label: 'Export',
          icon: 'download',
          hint: 'Download transactions as CSV',
          on: () => download(`/admin/payments/export?f=${p.filter}`),
        },
      ]
    : [];

  const total = p.kpis.desk + p.kpis.online;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Payments & refunds" sub="Money in and out: Paystack, desk cash and MoMo, and deposits held." actions={actions} />
      <KpiGrid
        kpis={[
          {
            label: 'Collected today',
            value: formatGhs(total),
            sub: `Paystack ${formatGhs(p.kpis.online)} · Desk ${formatGhs(p.kpis.desk)}`,
          },
          {
            label: 'Deposits held',
            value: formatGhs(p.kpis.deposits.held),
            sub: `${p.kpis.deposits.n} rental order${p.kpis.deposits.n === 1 ? '' : 's'}`,
          },
          {
            label: 'Refunds to approve',
            value: String(p.kpis.refunds.n),
            sub: p.kpis.refunds.n ? formatGhs(p.kpis.refunds.owed) : 'All clear',
            subColor: p.kpis.refunds.n ? 'var(--amber-ink)' : 'var(--green)',
          },
        ]}
      />
      <Tabs list={TABS} cur={tab} set={setTab} label="Payments" />
      {tab === 'Transactions' && (
        <DataTable
          title="Transactions"
          count={String(p.tx.total)}
          minW={820}
          chips={(Object.keys(FILTER_LABEL) as TxFilter[]).map((f) => ({
            label: FILTER_LABEL[f],
            pressed: p.filter === f,
            href: href({ f: f === 'all' ? null : f, p_tx: null }),
          }))}
          cols={[col('DATE'), col('FOR'), col('CUSTOMER'), col('METHOD'), col('CHANNEL'), col('AMOUNT', 'right')]}
          rows={p.tx.rows.map((x): Row => ({
            key: x.id,
            on: x.ref !== '—' ? () => open(x.kind, x.ref) : undefined,
            cells: [
              c(formatDayMonth(x.day), 'mono'),
              c(x.ref, 'mono'),
              c(x.who),
              c(x.method),
              c(x.channel, 'mute'),
              c(formatGhs(x.amount), 'money'),
            ],
          }))}
          empty={{
            icon: 'wallet',
            text: p.filter === 'all' ? 'No payments yet' : `No ${FILTER_LABEL[p.filter].toLowerCase()} payments yet`,
          }}
          pager={{ page: p.tx.page, total: p.tx.total, href: (n) => href({ p_tx: n ? String(n) : null }) }}
        />
      )}
      {tab === 'Refunds' && (
        <DataTable
          title="Refunds"
          count={String(p.refunds.total)}
          minW={880}
          cols={[col('FOR'), col('CUSTOMER'), col('REASON'), col('REQUESTED BY'), col('AMOUNT', 'right'), col('STATUS')]}
          rows={p.refunds.rows.map((r): Row => ({
            key: r.id,
            cells: [
              c(r.ref, 'mono', formatDayMonth(r.at)),
              c(r.who),
              c(r.reason, 'wrap'),
              c(
                r.by,
                undefined,
                r.approvedBy && !r.pending ? `${r.status === 'Rejected' ? 'Rejected' : 'Approved'} by ${r.approvedBy}` : undefined,
              ),
              c(formatGhs(r.amount), 'money', r.channel === 'Desk' ? 'Pay back by hand' : undefined),
              c(r.status, 'chip'),
            ],
            actions:
              r.pending && can('refunds.approve')
                ? [
                    { label: 'Approve', icon: 'check', kind: 'primary', on: () => openModal(<ApproveModal r={r} />) },
                    {
                      label: 'Reject refund',
                      icon: 'x',
                      kind: 'danger',
                      iconOnly: true,
                      on: () =>
                        openModal(
                          <ConfirmModal
                            title="Reject this refund?"
                            sub={`${r.who} won’t get ${formatGhs(r.amount)} back. Let them know why.`}
                            confirm="Reject"
                            run={() => rejectRefundAction(r.id)}
                          />,
                        ),
                    },
                  ]
                : [],
          }))}
          empty={{ icon: 'undo', text: 'No refunds', sub: 'Refunds staff ask for wait here for a Super Admin.' }}
          pager={{ page: p.refunds.page, total: p.refunds.total, href: (n) => href({ p_rf: n ? String(n) : null }) }}
        />
      )}
      {tab === 'Deposits held' && (
        <DataTable
          title="Security deposits held"
          count={String(p.deposits.length)}
          minW={620}
          cols={[col('ORDER'), col('CUSTOMER'), col('DUE BACK'), col('HELD', 'right')]}
          rows={p.deposits.map((d): Row => ({
            key: d.ref,
            on: () => openDrawer({ kind: 'rental', ref: d.ref }),
            cells: [
              c(d.ref, 'mono'),
              c(d.who),
              c(formatDayMonth(d.dueBack), 'mono', d.dueBack < p.today ? 'Overdue' : undefined),
              c(formatGhs(d.held), 'money'),
            ],
          }))}
          empty={{ icon: 'wallet', text: 'No deposits held' }}
        />
      )}
      {tab === 'Cash-up' && (
        <DataTable
          title={`Cash-up · ${longDay(p.day)}`}
          count={p.cash.length ? formatGhs(p.cash.reduce((t, x) => t + x.amount, 0)) : ''}
          minW={560}
          chips={[
            { label: 'Today', pressed: p.day === p.today, href: href({ day: null }) },
            ...[1, 2, 3, 4, 5, 6].map((n) => {
              const d = new Date(p.today + 'T00:00:00Z');
              d.setUTCDate(d.getUTCDate() - n);
              const iso = d.toISOString().slice(0, 10);
              return { label: n === 1 ? 'Yesterday' : formatDayMonth(iso), pressed: p.day === iso, href: href({ day: iso }) };
            }),
          ]}
          cols={[col('METHOD'), col('CHANNEL'), col('PAYMENTS', 'right'), col('EXPECTED', 'right')]}
          rows={p.cash.map((x): Row => ({
            key: x.method + x.channel,
            cells: [c(x.method), c(x.channel, 'mute'), c(x.n, 'num'), c(formatGhs(x.amount), 'money')],
          }))}
          empty={{
            icon: 'cash',
            text: p.day === p.today ? 'Nothing collected yet today' : 'Nothing collected that day',
            sub: 'Count the drawer against the Desk rows; Paystack settles to the bank.',
          }}
        />
      )}
    </div>
  );
}

function ApproveModal({ r }: { r: RefundRow }) {
  const { run, busy, errors, setErrors } = useAction();
  const [pw, setPw] = useState('');
  return (
    <ModalFrame
      title="Approve this refund?"
      sub={`${r.ref} · ${r.who} · ${r.reason}`}
      confirm={`Approve ${formatGhs(r.amount)}`}
      busy={busy}
      onConfirm={() => run(() => approveRefundAction({ id: r.id, password: pw }))}
    >
      <Lines
        lines={[
          { k: 'REFUND', v: formatGhs(r.amount), weight: 600 },
          { k: 'REQUESTED BY', v: r.by, color: 'var(--mute)' },
        ]}
      />
      <FieldGrid>
        <PasswordField
          value={pw}
          onChange={(v) => {
            setPw(v);
            setErrors({});
          }}
          err={errors.pw}
          wide
        />
      </FieldGrid>
      <Note>
        {r.channel === 'Desk'
          ? 'This was paid at the desk, so pay it back by hand (cash or MoMo) once approved.'
          : 'The money goes back the way the customer paid, usually within 1 to 3 working days.'}
      </Note>
    </ModalFrame>
  );
}
