'use client';
// Venues & enquiries from Admin.dc.html: the pipeline board (New → Quoted →
// Deposit paid → Done) and the venue calendar of quoted and booked events.
import { ENQUIRY_STAGE, type EnquiryStage } from '@/lib/admin/labels';
import { addDays, formatDayMonth, type IsoDate } from '@/lib/dates';
import { formatGhs } from '@/lib/money';
import { telHref } from '@/lib/phone';
import type { EnquiryRow } from '@/server/admin/rentals';
import { useAdmin } from '../context';
import { Kanban } from '../kanban';
import { PageHeader, Tabs, useTab } from '../page-parts';
import { Timeline, type TlRow } from '../timeline';
import type { Action } from '../ui';
import { useShiftFrom } from './rentals-view';
import { QuoteModal, useEnquiryMoves } from './ui';

const STAGES: EnquiryStage[] = ['new', 'quoted', 'deposit_paid', 'done'];

export function VenuesView({ today, from, rows }: { today: IsoDate; from: IsoDate; rows: EnquiryRow[] }) {
  const tabs = [['Board', rows.filter((e) => e.stage === 'new').length] as [string, number], 'Calendar'];
  const [tab, setTab] = useTab(tabs, 'Board');
  const { can, openDrawer, openModal } = useAdmin();
  const moves = useEnquiryMoves();
  const shift = useShiftFrom(from, today);
  const open = (ref: string) => () => openDrawer({ kind: 'enquiry', ref });

  const cardActions = (e: EnquiryRow): Action[] => [
    ...(e.stage === 'new' && can('venues.quote')
      ? [{ label: 'Build quote', icon: 'file', kind: 'primary', on: () => openModal(<QuoteModal e={e} />) } satisfies Action]
      : []),
    ...moves(e),
    ...(e.phone
      ? [{ label: `Call ${e.who}`, icon: 'phone', iconOnly: true, on: () => (location.href = telHref(e.phone)) } satisfies Action]
      : []),
  ];

  const venueRows: TlRow[] = [];
  for (const e of rows.filter((x) => x.stage !== 'new' && x.stage !== 'lost')) {
    const label = e.venueSlug === 'compound' ? 'Compound' : 'Conf. room';
    let row = venueRows.find((r) => r.key === label);
    if (!row) venueRows.push((row = { key: label, label, sub: e.venue, bars: [] }));
    row.bars.push({
      key: e.ref,
      label: e.who,
      title: `${e.who} · ${e.what || 'Event'} · ${ENQUIRY_STAGE[e.stage]}`,
      from: e.date,
      to: addDays(e.date, 1),
      tone: e.stage === 'deposit_paid' ? 'solid' : e.stage === 'quoted' ? 'amber' : 'grey',
      onOpen: open(e.ref),
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PageHeader title="Venues & enquiries" sub="The compound (100–200 guests) and the second-floor conference room." />
      <Tabs list={tabs} cur={tab} set={setTab} label="Venue views" />
      {tab === 'Board' ? (
        <Kanban
          lanes={STAGES.map((st) => ({
            title: ENQUIRY_STAGE[st],
            cards: rows
              .filter((e) => e.stage === st)
              .map((e) => ({
                key: e.ref,
                ref: e.ref,
                when: formatDayMonth(e.date),
                title: e.who,
                sub: `${e.what || 'Event'} · ${e.venue} · ${e.guests} guests${e.quoteTotal != null ? ' · ' + formatGhs(e.quoteTotal) : ''}`,
                onOpen: open(e.ref),
                actions: cardActions(e),
              })),
          }))}
        />
      ) : (
        <Timeline
          title="Venue calendar"
          hint="Quoted and confirmed events"
          rowHead="VENUE"
          firstCol={150}
          start={from}
          today={today}
          onShift={shift}
          rows={venueRows}
          emptyText="Nothing in these two weeks. Use the arrows to look further."
        />
      )}
    </div>
  );
}
