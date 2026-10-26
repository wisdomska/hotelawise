// SMS through Arkesel (Ghana). Off unless SMS_PROVIDER and SMS_API_KEY are set;
// in development the message is printed instead.
import 'server-only';
import { env } from '@/server/platform/env';

export function smsConfigured(): boolean {
  const e = env();
  return e.SMS_PROVIDER === 'arkesel' && !!e.SMS_API_KEY;
}

/** Sends one SMS. Returns false when SMS is off; throws when the provider rejects it. */
export async function sendSms(toE164: string, message: string): Promise<boolean> {
  const e = env();
  if (!smsConfigured()) {
    if (e.APP_ENV === 'development') {
      console.info(`[sms:dev] to=${toE164}\n${message}`);
      return true;
    }
    return false;
  }
  const res = await fetch('https://sms.arkesel.com/api/v2/sms/send', {
    method: 'POST',
    headers: { 'api-key': e.SMS_API_KEY!, 'content-type': 'application/json' },
    body: JSON.stringify({ sender: e.SMS_SENDER_ID ?? 'AWise', message, recipients: [toE164.replace(/^\+/, '')] }),
  });
  if (!res.ok) throw new Error(`Arkesel responded ${res.status}`);
  return true;
}
