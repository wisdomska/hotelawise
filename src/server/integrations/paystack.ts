// Paystack (Ghana): MoMo charges sent straight to the guest's phone, card payments
// through Paystack's own popup, verification, refunds and webhook signatures.
// Amounts are pesewas, which is what Paystack expects for GHS.
import 'server-only';
import { env } from '@/server/platform/env';

const API = 'https://api.paystack.co';

export type MomoProvider = 'mtn' | 'vod' | 'atl';
export const MOMO_PROVIDER: Record<'mtn' | 'telecel' | 'airteltigo', MomoProvider> = { mtn: 'mtn', telecel: 'vod', airteltigo: 'atl' };

export class PaystackNotConfiguredError extends Error {
  constructor() {
    super('Online payment is not switched on yet.');
    this.name = 'PaystackNotConfiguredError';
  }
}

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'PaystackError';
  }
}

export function paystackConfigured(): boolean {
  return !!env().PAYSTACK_SECRET_KEY;
}

type Envelope<T> = { status: boolean; message: string; data: T };

async function call<T>(path: string, init?: { method?: 'GET' | 'POST'; body?: unknown }): Promise<T> {
  const key = env().PAYSTACK_SECRET_KEY;
  if (!key) throw new PaystackNotConfiguredError();
  const res = await fetch(`${API}${path}`, {
    method: init?.method ?? 'GET',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  let json: Envelope<T> | null = null;
  try {
    json = (await res.json()) as Envelope<T>;
  } catch {
    // fall through
  }
  if (!res.ok || !json?.status) throw new PaystackError(json?.message ?? `Paystack responded ${res.status}`, res.status);
  return json.data;
}

export type ChargeStatus =
  'success' | 'failed' | 'send_otp' | 'pay_offline' | 'pending' | 'send_birthday' | 'open_url' | 'abandoned' | 'ongoing' | 'reversed';
export type ChargeResult = { status: ChargeStatus; reference: string; display_text?: string; gateway_response?: string; message?: string };

/** Sends a MoMo prompt to the payer's phone. */
export function chargeMomo(input: {
  email: string;
  amount: number;
  reference: string;
  phone: string;
  provider: MomoProvider;
  metadata: Record<string, unknown>;
}) {
  return call<ChargeResult>('/charge', {
    method: 'POST',
    body: {
      email: input.email,
      amount: input.amount,
      currency: 'GHS',
      reference: input.reference,
      mobile_money: { phone: input.phone, provider: input.provider },
      metadata: input.metadata,
    },
  });
}

/** Telecel Cash asks for a voucher code the payer generates on their phone. */
export function submitOtp(reference: string, otp: string) {
  return call<ChargeResult>('/charge/submit_otp', { method: 'POST', body: { otp, reference } });
}

/** Starts a card payment; the browser completes it in Paystack's popup with the access code. */
export function initializeCard(input: {
  email: string;
  amount: number;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
}) {
  return call<{ authorization_url: string; access_code: string; reference: string }>('/transaction/initialize', {
    method: 'POST',
    body: {
      email: input.email,
      amount: input.amount,
      currency: 'GHS',
      reference: input.reference,
      channels: ['card'],
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    },
  });
}

export type VerifiedTransaction = {
  status: 'success' | 'failed' | 'abandoned' | 'reversed' | 'pending' | 'ongoing' | 'queued' | 'processing';
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  id: number;
  gateway_response: string;
  paid_at: string | null;
  metadata: Record<string, unknown> | null;
  authorization?: { channel?: string; bank?: string; mobile_money_number?: string };
};

export function verifyTransaction(reference: string) {
  return call<VerifiedTransaction>(`/transaction/verify/${encodeURIComponent(reference)}`);
}

export function refundTransaction(reference: string, amount: number, note: string) {
  return call<{ id: number; status: string }>('/refund', { method: 'POST', body: { transaction: reference, amount, merchant_note: note } });
}

/** Checks the x-paystack-signature header: HMAC-SHA512 of the raw body with the secret key. */
export async function validSignature(rawBody: string, signature: string | null): Promise<boolean> {
  const key = env().PAYSTACK_SECRET_KEY;
  if (!key || !signature) return false;
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(rawBody)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ signature.toLowerCase().charCodeAt(i);
  return diff === 0;
}

/** Plain-language reasons for the ways a MoMo or card payment usually fails. */
export function failureReason(gatewayResponse: string | undefined, method: 'momo' | 'card'): string {
  const g = (gatewayResponse ?? '').toLowerCase();
  if (g.includes('insufficient'))
    return method === 'card' ? 'Your bank said there were not enough funds.' : 'The wallet did not have enough money.';
  if (g.includes('timed out') || g.includes('timeout') || g.includes('expired')) return 'The prompt timed out before a PIN was entered.';
  if (g.includes('declined') || g.includes('cancel'))
    return method === 'card' ? 'Your bank declined the card.' : 'The prompt was declined.';
  return method === 'card' ? 'Your bank declined the card.' : 'The prompt was declined or timed out.';
}
