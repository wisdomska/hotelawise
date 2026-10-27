import { CustomersScreen } from '@/components/admin/customers/screen';
import { listCustomers, listSubscribers } from '@/server/admin/customers';
import { requirePage } from '@/server/auth/session';
import { db } from '@/server/platform/db';

export const metadata = { title: 'Customers' };

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
const pageNo = (v: string) => Math.max(0, Math.min(10_000, Math.floor(Number(v)) || 0));

export default async function CustomersPage({ searchParams }: { searchParams: SP }) {
  await requirePage('customers.view');
  const sp = await searchParams;
  const q = one(sp.q).slice(0, 80);
  const cuPage = pageNo(one(sp.p_cu));
  const nsPage = pageNo(one(sp.p_ns));
  const d = await db();
  const [customers, subscribers] = await Promise.all([listCustomers(d, { q, page: cuPage }), listSubscribers(d, nsPage)]);
  return <CustomersScreen q={q} customers={{ ...customers, page: cuPage }} subscribers={{ ...subscribers, page: nsPage }} />;
}
