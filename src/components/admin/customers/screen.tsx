'use client';
// Customers (Admin.dc.html screen "customers"): everyone who has stayed,
// rented or enquired, with search, and the newsletter list.
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { removeSubscriberAction } from '@/app/admin/(app)/customers/actions';
import { Icon } from '@/components/ui/icon';
import { formatDayMonth } from '@/lib/dates';
import { formatPhoneLocal, telHref } from '@/lib/phone';
import type { CustomerRow, Subscriber } from '@/server/admin/customers';
import { useAdmin } from '../context';
import { ConfirmModal } from '../modal';
import { PageHeader, Tabs, useTab, type TabDef } from '../page-parts';
import { useExportAction } from '../export';
import { useHref } from '../payments/use-href';
import { c, col, DataTable, type Row } from '../table';
import type { Action } from '../ui';

type Props = {
  q: string;
  customers: { rows: CustomerRow[]; total: number; page: number };
  subscribers: { rows: Subscriber[]; total: number; page: number };
};

export function CustomersScreen(p: Props) {
  const { can, openDrawer, openModal } = useAdmin();
  const href = useHref();
  const TABS: TabDef[] = ['Customers', ['Newsletter', p.subscribers.total]];
  const [tab, setTab] = useTab(TABS, 'Customers');
  const canRemove = can('settings.edit');
  const exportAction = useExportAction();
  const actions: Action[] =
    tab === 'Newsletter' && can('exports.download') && p.subscribers.total > 0
      ? [exportAction('newsletter subscribers', '/admin/customers/export')]
      : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader title="Customers" sub="Guests and rental customers in one place." actions={actions} />
      <Tabs list={TABS} cur={tab} set={setTab} label="Customers" />
      {tab === 'Customers' && (
        <DataTable
          title="Customers"
          count={String(p.customers.total)}
          minW={760}
          headerExtra={<Search q={p.q} />}
          cols={[col('NAME'), col('PHONE'), col('STAYS', 'right'), col('RENTALS', 'right'), col('EVENTS', 'right'), col('LAST SEEN')]}
          rows={p.customers.rows.map((x): Row => {
            const visits = x.stays + x.orders + x.events;
            return {
              key: x.id,
              on: () => openDrawer({ kind: 'customer', id: x.id }),
              cells: [
                c(x.name, undefined, visits > 1 ? 'Repeat customer' : undefined),
                c(formatPhoneLocal(x.phone), 'mono'),
                c(x.stays, 'num'),
                c(x.orders, 'num'),
                c(x.events, 'num'),
                c(x.last ? formatDayMonth(x.last) : '—', 'mono'),
              ],
              actions: [
                { label: `Call ${x.name}`, icon: 'phone', iconOnly: true, on: () => (location.href = telHref(x.phone)) },
                { label: 'Open profile', icon: 'eye', iconOnly: true, on: () => openDrawer({ kind: 'customer', id: x.id }) },
              ],
            };
          })}
          empty={
            p.q
              ? { icon: 'search', text: `No one matches “${p.q}”`, sub: 'Try part of the name, or the last digits of the phone number.' }
              : { icon: 'users', text: 'No customers yet', sub: 'Guests, rental customers and venue enquiries show here.' }
          }
          pager={{ page: p.customers.page, total: p.customers.total, href: (n) => href({ p_cu: n ? String(n) : null }) }}
        />
      )}
      {tab === 'Newsletter' && (
        <DataTable
          title="Newsletter subscribers"
          count={String(p.subscribers.total)}
          minW={480}
          cols={[col('EMAIL'), col('SIGNED UP'), col('FROM')]}
          rows={p.subscribers.rows.map((x): Row => ({
            key: x.id,
            cells: [c(x.email), c(formatDayMonth(x.at), 'mono'), c(x.source === 'footer' ? 'Website footer' : x.source, 'mute')],
            actions: canRemove
              ? [
                  {
                    label: 'Remove subscriber',
                    icon: 'trash',
                    kind: 'danger',
                    iconOnly: true,
                    on: () =>
                      openModal(
                        <ConfirmModal
                          title="Remove this subscriber?"
                          sub={x.email}
                          confirm="Remove"
                          run={() => removeSubscriberAction(x.id)}
                        />,
                      ),
                  },
                ]
              : [],
          }))}
          empty={{ icon: 'mail', text: 'No subscribers yet', sub: 'People who sign up in the website footer show here.' }}
          pager={{ page: p.subscribers.page, total: p.subscribers.total, href: (n) => href({ p_ns: n ? String(n) : null }) }}
        />
      )}
    </div>
  );
}

/** Searches as you type (after a short pause), keeping the result in the URL. */
function Search({ q }: { q: string }) {
  const router = useRouter();
  const href = useHref();
  const [v, setV] = useState(q);
  useEffect(() => {
    if (v.trim() === q) return;
    const t = setTimeout(() => router.replace(href({ q: v.trim() || null, p_cu: null }), { scroll: false }), 300);
    return () => clearTimeout(t);
  }, [v, q, router, href]);
  return (
    <label style={{ marginLeft: 'auto', position: 'relative', display: 'flex', alignItems: 'center', flex: '0 1 260px', minWidth: 180 }}>
      <span className="sr-only">Search customers</span>
      <span style={{ position: 'absolute', left: 10, color: 'var(--mute)', display: 'flex' }}>
        <Icon name="search" size={14} />
      </span>
      <input
        type="search"
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="Name, phone or email"
        style={{
          width: '100%',
          height: 40,
          padding: '0 10px 0 30px',
          borderRadius: 8,
          border: '1px solid var(--field)',
          background: 'var(--bg)',
          color: 'var(--ink)',
          fontSize: 13.5,
        }}
      />
    </label>
  );
}
