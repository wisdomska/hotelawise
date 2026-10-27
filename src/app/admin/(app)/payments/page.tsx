import { isIsoDate, todayInAccra } from '@/lib/dates';
import { PaymentsScreen } from '@/components/admin/payments/screen';
import { cashUp, depositsHeld, listRefunds, listTransactions, paymentKpis, TX_FILTERS, type TxFilter } from '@/server/admin/payments';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Payments & refunds' };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const pageNo = (v: string) => Math.max(0, Math.min(10_000, Math.floor(Number(v)) || 0));

export default async function PaymentsPage({ searchParams }: { searchParams: SP }) {
  await requirePage('payments.view');
  const sp = await searchParams;
  const today = todayInAccra();
  const f = one(sp.f);
  const filter: TxFilter = (TX_FILTERS as readonly string[]).includes(f) ? (f as TxFilter) : 'all';
  const dayParam = one(sp.day);
  const day = isIsoDate(dayParam) && dayParam <= today ? dayParam : today;
  const txPage = pageNo(one(sp.p_tx));
  const rfPage = pageNo(one(sp.p_rf));
  const d = await db();
  const [kpis, tx, refunds, deposits, cash] = await Promise.all([
    paymentKpis(d, today),
    listTransactions(d, { filter, page: txPage }),
    listRefunds(d, rfPage),
    depositsHeld(d),
    cashUp(d, day),
  ]);
  return (
    <PaymentsScreen
      today={today}
      day={day}
      filter={filter}
      kpis={kpis}
      tx={{ ...tx, page: txPage }}
      refunds={{ ...refunds, page: rfPage }}
      deposits={deposits}
      cash={cash}
    />
  );
}
