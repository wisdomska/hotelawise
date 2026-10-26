import type { Metadata } from 'next';
import { eq } from 'drizzle-orm';
import { SEED_SETTINGS } from '@/server/content/defaults';
import * as s from '@/server/db/schema';
import { db } from '@/server/platform/db';
import { LoginFlow, type Step } from './login-flow';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

async function idleMinutes(): Promise<number> {
  if (!process.env.DATABASE_URL) return SEED_SETTINGS['admin.sessionTimeoutMinutes'];
  try {
    const [row] = await (
      await db()
    )
      .select({ value: s.settings.value })
      .from(s.settings)
      .where(eq(s.settings.key, 'admin.sessionTimeoutMinutes'));
    return Number(row?.value ?? SEED_SETTINGS['admin.sessionTimeoutMinutes']) || 30;
  } catch {
    return SEED_SETTINGS['admin.sessionTimeoutMinutes'];
  }
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ step?: string; setup?: string; reason?: string }> }) {
  const { step, setup, reason } = await searchParams;
  const initial: Step =
    setup === 'change-password' ? 'change-password' : setup === 'enrol-2fa' ? 'enrol-2fa' : step === '2fa' ? 'totp' : 'password';
  return (
    <LoginFlow
      initial={initial}
      idle={reason === 'idle'}
      idleMinutes={await idleMinutes()}
      resetByEmail={!!process.env.RESEND_API_KEY || process.env.APP_ENV === 'development'}
    />
  );
}
