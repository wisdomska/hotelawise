// Inbox: messages from the website contact form. Staff assign them, move them
// through New → Assigned → Replied → Closed, and reply by email (when the
// sender gave one) or SMS. The reply is saved with the message.
import 'server-only';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { MESSAGE_STATUS } from '@/lib/admin/labels';
import { formatPhoneLocal } from '@/lib/phone';
import * as s from '@/server/db/schema';
import { sendEmail } from '@/server/integrations/email';
import { sendSms } from '@/server/integrations/sms';
import { audit } from '@/server/services/audit';
import type { AnyDb } from '@/server/services/holds';
import { AdminError } from './act';
import type { Who } from './bookings';

export type MessageStatus = keyof typeof MESSAGE_STATUS;

export type InboxMessage = {
  id: string;
  from: string;
  phone: string | null;
  email: string | null;
  contact: string;
  subject: string;
  body: string;
  status: MessageStatus;
  assigneeId: string | null;
  at: string;
  replies: { by: string; body: string; channel: 'email' | 'sms' | 'note'; at: string }[];
};

/** The contact form stores "+233… · name@example.com", or just the phone. */
export function splitContact(contact: string): { phone: string | null; email: string | null } {
  const parts = contact.split('·').map((p) => p.trim());
  return { phone: parts.find((p) => /^\+\d{7,15}$/.test(p)) ?? null, email: parts.find((p) => p.includes('@')) ?? null };
}

export async function listMessages(db: AnyDb, limit = 200): Promise<InboxMessage[]> {
  const msgs = await db.select().from(s.messages).orderBy(desc(s.messages.createdAt)).limit(limit);
  const ids = msgs.map((m) => m.id);
  const replies = ids.length
    ? await db
        .select({
          messageId: s.messageReplies.messageId,
          by: s.user.name,
          body: s.messageReplies.body,
          channel: s.messageReplies.channel,
          at: s.messageReplies.createdAt,
        })
        .from(s.messageReplies)
        .leftJoin(s.user, eq(s.user.id, s.messageReplies.byUserId))
        .where(inArray(s.messageReplies.messageId, ids))
        .orderBy(asc(s.messageReplies.createdAt))
    : [];
  return msgs.map((m) => {
    const { phone, email } = splitContact(m.contact);
    return {
      id: m.id,
      from: m.fromName,
      phone,
      email,
      contact: [phone ? formatPhoneLocal(phone) : null, email].filter(Boolean).join(' · ') || m.contact,
      subject: m.subject,
      body: m.body,
      status: m.status,
      assigneeId: m.assigneeId,
      at: m.createdAt.toISOString(),
      replies: replies
        .filter((r) => r.messageId === m.id)
        .map((r) => ({ by: r.by ?? 'Hotel A-Wise', body: r.body, channel: r.channel, at: r.at.toISOString() })),
    };
  });
}

/** People a message can be assigned to: everyone with an active account. */
export async function assignees(db: AnyDb) {
  return db
    .select({ id: s.user.id, name: s.user.name, job: s.user.jobTitle })
    .from(s.user)
    .where(eq(s.user.banned, false))
    .orderBy(asc(s.user.name));
}

async function load(db: AnyDb, id: string) {
  const [m] = await db.select().from(s.messages).where(eq(s.messages.id, id)).for('update');
  if (!m) throw new AdminError('That message no longer exists.');
  return m;
}

export async function assignMessage(db: AnyDb, by: Who, id: string, userId: string | null) {
  const m = await load(db, id);
  let name = 'Unassigned';
  if (userId) {
    const [u] = await db
      .select({ name: s.user.name })
      .from(s.user)
      .where(and(eq(s.user.id, userId), eq(s.user.banned, false)));
    if (!u) throw new AdminError('That person can’t take messages right now.');
    name = u.name;
  }
  if (m.assigneeId === userId) return { name };
  const status = userId && m.status === 'new' ? 'assigned' : !userId && m.status === 'assigned' ? 'new' : m.status;
  await db.update(s.messages).set({ assigneeId: userId, status }).where(eq(s.messages.id, id));
  await audit(db, {
    actor: by,
    action: 'Assigned message',
    entity: 'message',
    entityId: id,
    target: m.fromName,
    after: { assignee: name },
  });
  return { name };
}

export async function setMessageStatus(db: AnyDb, by: Who, id: string, status: MessageStatus) {
  const m = await load(db, id);
  if (m.status === status) return;
  await db.update(s.messages).set({ status }).where(eq(s.messages.id, id));
  await audit(db, {
    actor: by,
    action: 'Message status',
    entity: 'message',
    entityId: id,
    target: m.fromName,
    before: { status: MESSAGE_STATUS[m.status] },
    after: { status: MESSAGE_STATUS[status] },
  });
}

/**
 * Sends the reply (email when the sender left one, otherwise SMS), then saves
 * it. If nothing can be sent, nothing is saved, so the inbox never claims a
 * reply went out when it didn't.
 */
export async function replyToMessage(db: AnyDb, by: Who, id: string, body: string, signature: string) {
  const m = await load(db, id);
  const { phone, email } = splitContact(m.contact);
  let channel: 'email' | 'sms';
  let to: string;
  try {
    if (email) {
      await sendEmail(email, `Re: ${m.subject} · Hotel A-Wise`, `${body}\n\n${signature}`);
      channel = 'email';
      to = email;
    } else if (phone) {
      const sent = await sendSms(phone, `${body}\n${signature}`.slice(0, 600));
      if (!sent) throw new AdminError('Text messages aren’t switched on yet. Call or WhatsApp them instead.');
      channel = 'sms';
      to = formatPhoneLocal(phone);
    } else throw new AdminError('This message has no email or phone number to reply to.');
  } catch (e) {
    if (e instanceof AdminError) throw e;
    console.error('inbox reply not sent', e);
    throw new AdminError('The reply couldn’t be sent. Try again in a minute, or call them.');
  }
  await db.insert(s.messageReplies).values({ messageId: id, byUserId: by.id, body, channel });
  await db
    .update(s.messages)
    .set({ status: 'replied', assigneeId: m.assigneeId ?? by.id })
    .where(eq(s.messages.id, id));
  await audit(db, { actor: by, action: 'Replied to message', entity: 'message', entityId: id, target: m.fromName, after: { channel, to } });
  return { channel, to };
}
