import { RoomsView } from '@/components/admin/rooms/view';
import { roomBoard } from '@/server/admin/bookings';
import { listBlackouts, listPromos, listRules, policies, roomTypeRows } from '@/server/admin/rates';
import { can } from '@/server/auth/permissions';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Rooms & rates' };

export default async function RoomsPage() {
  const actor = await requirePage('rooms.view');
  const d = await db();
  const [board, types, rules, promos, blackouts, policy] = await Promise.all([
    roomBoard(d),
    roomTypeRows(d),
    listRules(d),
    listPromos(d),
    listBlackouts(d),
    policies(d),
  ]);
  return (
    <RoomsView
      canEdit={can(actor, 'rooms.edit')}
      board={board}
      types={types}
      rules={rules.map((r) => ({ ...r, createdAt: undefined, updatedAt: undefined }))}
      promos={promos.map((p) => ({ ...p, createdAt: undefined, updatedAt: undefined }))}
      blackouts={blackouts}
      policies={policy}
    />
  );
}
