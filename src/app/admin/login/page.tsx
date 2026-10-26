import type { Metadata } from 'next';
import { LoginFlow } from './login-flow';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ step?: string; setup?: string }> }) {
  const { step, setup } = await searchParams;
  const initial =
    setup === 'change-password' ? 'change-password' : setup === 'enrol-2fa' ? 'enrol-2fa' : step === '2fa' ? 'totp' : 'password';
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <LoginFlow initial={initial} />
    </main>
  );
}
