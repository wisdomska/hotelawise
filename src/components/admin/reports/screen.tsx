'use client';
// Reports from Admin.dc.html: the last 30 days for rooms, rentals and staff,
// with a CSV of the rows behind the open tab.
import { exportReportAction } from '@/app/admin/(app)/reports/actions';
import { formatGhs } from '@/lib/money';
import type { StaffRow } from '@/server/admin/reports';
import { ChartGrid, RankChart } from '../charts';
import { useAdmin } from '../context';
import { KpiGrid, PageHeader, Tabs, useTab } from '../page-parts';
import { c, col, DataTable } from '../table';
import { useAction } from '../use-action';

export type RoomsData = {
  occupancy: number;
  adr: number;
  revpar: number;
  nightsSold: number;
  byType: [string, number][];
  bySource: [string, number][];
};
export type RentalsData = { utilisation: number; orders: number; hire: number; items: [string, number][]; occasions: [string, number][] };

const TABS = ['Rooms', 'Rentals', 'Staff'] as const;
const plural = (n: number, one: string, many = one + 's') => `${n.toLocaleString('en-GH')} ${n === 1 ? one : many}`;

export function ReportsScreen({
  rooms,
  rentals,
  staff,
}: {
  rooms: RoomsData | null;
  rentals: RentalsData | null;
  staff: StaffRow[] | null;
}) {
  const { can } = useAdmin();
  const [t, setT] = useTab(TABS, 'Rooms');
  const { run, busy } = useAction();
  const exportCsv = async () => {
    const r = await run(() => exportReportAction(t), { close: false });
    if (!r.ok || !r.data) return;
    const { csv, name } = r.data as { csv: string; name: string };
    const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return (
    <>
      <PageHeader
        title="Reports"
        sub="The last 30 days."
        actions={
          can('exports.download')
            ? [
                {
                  label: busy ? 'Preparing…' : 'Export',
                  icon: 'download',
                  hint: 'Download as CSV',
                  disabled: busy,
                  on: () => void exportCsv(),
                },
              ]
            : []
        }
      />
      <Tabs list={TABS} cur={t} set={setT} label="Report" />
      {t === 'Rooms' && rooms && (
        <>
          <KpiGrid
            kpis={[
              { label: 'Occupancy', value: `${rooms.occupancy}%`, sub: '30-day average', meter: rooms.occupancy },
              {
                label: 'Average rate',
                value: formatGhs(rooms.adr),
                sub: rooms.nightsSold ? `per occupied room · ${plural(rooms.nightsSold, 'night')}` : 'no nights sold yet',
              },
              { label: 'Revenue per room', value: formatGhs(rooms.revpar), sub: 'per available room, per night' },
            ]}
          />
          <ChartGrid>
            <RankChart title="Revenue by room type" note="payments received, last 30 days" rows={rooms.byType} fmt={(v) => formatGhs(v)} />
            <RankChart
              title="Where bookings come from"
              note="bookings made, last 30 days"
              rows={rooms.bySource}
              fmt={(v) => plural(v, 'booking')}
            />
          </ChartGrid>
        </>
      )}
      {t === 'Rentals' && rentals && (
        <>
          <KpiGrid
            kpis={[
              {
                label: 'Utilisation',
                value: `${rentals.utilisation}%`,
                sub: 'share of stock out on an average day',
                meter: rentals.utilisation,
              },
              { label: 'Orders', value: String(rentals.orders), sub: 'placed in the last 30 days' },
              { label: 'Hire value', value: formatGhs(rentals.hire), sub: 'before deposits' },
            ]}
          />
          <ChartGrid>
            <RankChart
              title="Best-selling items"
              note="unit-days, last 30 days"
              rows={rentals.items}
              fmt={(v) => v.toLocaleString('en-GH')}
            />
            <RankChart title="Orders by occasion" note="last 30 days" rows={rentals.occasions} fmt={(v) => plural(v, 'order')} />
          </ChartGrid>
        </>
      )}
      {t === 'Staff' && staff && (
        <DataTable
          title="Staff activity"
          count="30 days"
          minW={620}
          empty={{ icon: 'users', text: 'No staff yet' }}
          cols={[
            col('STAFF'),
            col('CHECK-INS', 'right'),
            col('DESK PAYMENTS', 'right'),
            col('ORDERS HANDLED', 'right'),
            col('REPLIES', 'right'),
          ]}
          rows={staff.map((s) => ({
            key: s.id,
            cells: [c(s.name), c(s.checkIns, 'num'), c(s.payments, 'num'), c(s.orders, 'num'), c(s.replies, 'num')],
          }))}
        />
      )}
    </>
  );
}
