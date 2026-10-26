'use server';
// Customer drawer reads, staff notes and newsletter subscribers.
import { z } from 'zod';
import { done } from '@/lib/admin/result';
import { act, read } from '@/server/admin/act';
import { customerDetail, removeSubscriber, setCustomerNote } from '@/server/admin/customers';
import { can } from '@/server/auth/permissions';
import { currentActor } from '@/server/auth/session';

const id = z.string().uuid();

export async function loadCustomer(customerId: string) {
  if (!id.safeParse(customerId).success) return null;
  return read('customers.view', async (d) => {
    const c = await customerDetail(d, customerId);
    if (!c) return null;
    // Lifetime spend is for people who can see money (Super Admins).
    const showSpend = can(await currentActor(), 'customers.spend');
    return { ...c, spend: showSpend ? c.spend : null };
  });
}

export async function saveCustomerNote(customerId: string, note: string) {
  return act('customers.note', async (tx, who) => {
    await setCustomerNote(tx, who, id.parse(customerId), note.slice(0, 2000));
    return done('Note saved.');
  });
}

export async function removeSubscriberAction(subscriberId: string) {
  return act('settings.edit', async (tx, who) => {
    const email = await removeSubscriber(tx, who, id.parse(subscriberId));
    return done('Subscriber removed.', `${email} won’t get the newsletter.`);
  });
}
