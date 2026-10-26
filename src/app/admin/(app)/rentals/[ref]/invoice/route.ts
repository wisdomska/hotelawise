import { staffInvoice } from '@/server/admin/invoice-response';

export async function GET(_req: Request, { params }: { params: Promise<{ ref: string }> }) {
  return staffInvoice('rental', (await params).ref);
}
