'use server';
// Inbox actions: assign, change status, reply.
import { z } from 'zod';
import { done, fail } from '@/lib/admin/result';
import { MESSAGE_STATUS } from '@/lib/admin/labels';
import { act } from '@/server/admin/act';
import { assignMessage, replyToMessage, setMessageStatus, type MessageStatus } from '@/server/admin/inbox';

const id = z.string().uuid();
const status = z.enum(Object.keys(MESSAGE_STATUS) as [MessageStatus, ...MessageStatus[]]);

export async function assignAction(messageId: string, userId: string | null) {
  return act('inbox.manage', async (tx, who) => {
    const { name } = await assignMessage(tx, who, id.parse(messageId), userId ? z.string().min(1).max(64).parse(userId) : null);
    return done(userId ? `Assigned to ${name}.` : 'Unassigned.');
  });
}

export async function messageStatusAction(messageId: string, to: string) {
  return act('inbox.manage', async (tx, who) => {
    const st = status.parse(to);
    await setMessageStatus(tx, who, id.parse(messageId), st);
    return done(`Marked ${MESSAGE_STATUS[st].toLowerCase()}.`);
  });
}

export async function replyAction(messageId: string, body: string) {
  const text = body.trim();
  if (!text) return fail('Write a reply first.', { reply: 'Write a reply first.' });
  if (text.length > 4000) return fail('Keep the reply under 4,000 characters.', { reply: 'Keep the reply under 4,000 characters.' });
  return act('inbox.manage', async (tx, who) => {
    const { channel, to } = await replyToMessage(tx, who, id.parse(messageId), text, `${who.name.split(' ')[0]}, Hotel A-Wise`);
    return done('Reply sent.', `${channel === 'email' ? 'Email' : 'SMS'} to ${to}`);
  });
}
