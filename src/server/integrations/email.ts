// Transactional email through Resend. Until a key is configured, development
// logs the message instead of sending it. Guest-facing wording lives in
// src/server/services/notify.ts.
import 'server-only';
import { env } from '@/server/platform/env';

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  const e = env();
  if (!e.RESEND_API_KEY) {
    if (e.APP_ENV === 'development') {
      console.info(`[email:dev] to=${to} subject=${subject}\n${text}`);
      return;
    }
    throw new Error('RESEND_API_KEY is not configured');
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: e.EMAIL_FROM, to, subject, text, reply_to: 'info@hotelawise.com' }),
  });
  if (!res.ok) throw new Error(`Resend responded ${res.status}`);
}

export function sendPasswordResetCode(email: string, code: string) {
  return sendEmail(
    email,
    'Your Hotel A-Wise admin reset code',
    `Your reset code is ${code}. It works for 10 minutes. If you didn't ask for this, you can ignore this email.`,
  );
}

/** Tells reception a website message has arrived (the full text is in Admin › Inbox). */
export function sendContactNotice(to: string, m: { subject: string; name: string; phone: string; email: string | null; message: string }) {
  return sendEmail(
    to,
    `New message: ${m.subject} from ${m.name}`,
    `${m.name} wrote through the website.\n\nPhone: ${m.phone}${m.email ? `\nEmail: ${m.email}` : ''}\nSubject: ${m.subject}\n\n${m.message}\n\nReply from Admin › Inbox.`,
  );
}
