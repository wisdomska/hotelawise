'use server';
// Refund approvals from Payments › Refunds. Approving moves money, so it asks
// for the Super Admin's password; rejecting doesn't.
import { z } from 'zod';
import { done } from '@/lib/admin/result';
import { formatGhs } from '@/lib/money';
import { act } from '@/server/admin/act';
import { approveRefund, rejectRefund } from '@/server/admin/refunds';

const id = z.string().uuid();

export async function approveRefundAction(raw: { id: string; password: string }) {
  return act(
    'refunds.approve',
    async (tx, who) => {
      const { failed } = await approveRefund(tx, who, id.parse(raw.id));
      return failed
        ? done('Refund approved.', `Paystack couldn’t send ${formatGhs(failed)}; pay that back by hand and note it on the order.`)
        : done('Refund approved.', 'It goes back the way the customer paid, usually within 1 to 3 working days.');
    },
    { password: raw.password },
  );
}

export async function rejectRefundAction(refundId: string) {
  return act('refunds.approve', async (tx, who) => {
    await rejectRefund(tx, who, id.parse(refundId));
    return done('Refund rejected.', 'Let the customer know why.');
  });
}
