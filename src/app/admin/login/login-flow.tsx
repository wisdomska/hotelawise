'use client';
// Sign-in → TOTP, and the first-login setup (new password, then 2FA for Super
// Admins). Visual port of the prototype sign-in screen arrives in milestone 5.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth/client';

type Step = 'password' | 'totp' | 'change-password' | 'enrol-2fa';

const field = 'w-full rounded-[var(--radius-control)] border border-[var(--line2)] bg-[var(--panel)] px-3 py-2.5';
const button =
  'w-full rounded-[var(--radius-control)] bg-[var(--pri-bg)] px-4 py-2.5 font-medium text-[var(--pri-fg)] transition-transform duration-150 ease-[var(--ease-enter)] active:scale-[0.97] disabled:opacity-60';

export function LoginFlow({ initial }: { initial: Step }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[]>([]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }
  const done = () => {
    router.replace('/admin');
    router.refresh();
  };

  if (step === 'password') {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(async () => {
            const res = await authClient.signIn.email({ email: String(f.get('email')), password: String(f.get('password')) });
            if (res.error) throw new Error('That email and password don’t match.');
            if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return setStep('totp');
            done();
          });
        }}
      >
        <h1 className="font-serif text-[length:var(--admin-h1)] font-normal">Sign in</h1>
        <label className="flex flex-col gap-1 text-sm">
          Email
          <input name="email" type="email" autoComplete="username" required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Password
          <input name="password" type="password" autoComplete="current-password" required className={field} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[var(--red)]">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={button}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    );
  }

  if (step === 'totp') {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
          void run(async () => {
            const res = await authClient.twoFactor.verifyTotp({ code });
            if (res.error) throw new Error('That code didn’t work. Check your authenticator app and try again.');
            done();
          });
        }}
      >
        <h1 className="font-serif text-[length:var(--admin-h1)] font-normal">Two-step check</h1>
        <label className="flex flex-col gap-1 text-sm">
          6-digit code
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]{6,7}"
            required
            className={`${field} font-mono tracking-[0.3em]`}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[var(--red)]">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={button}>
          Verify
        </button>
      </form>
    );
  }

  if (step === 'change-password') {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          void run(async () => {
            const res = await fetch('/admin/login/setup', {
              method: 'POST',
              body: JSON.stringify({ action: 'change-password', currentPassword: f.get('current'), newPassword: f.get('next') }),
            });
            const body = (await res.json()) as { next?: Step | 'done'; error?: string };
            if (!res.ok) throw new Error(body.error ?? 'Could not change the password.');
            if (body.next === 'done') done();
            else if (body.next) setStep(body.next);
          });
        }}
      >
        <h1 className="font-serif text-[length:var(--admin-h1)] font-normal">Choose your password</h1>
        <p className="text-sm text-[var(--mute)]">At least 8 characters, with letters and a number.</p>
        <label className="flex flex-col gap-1 text-sm">
          Temporary password
          <input name="current" type="password" autoComplete="current-password" required className={field} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          New password
          <input name="next" type="password" autoComplete="new-password" minLength={8} required className={field} />
        </label>
        {error && (
          <p role="alert" className="text-sm text-[var(--red)]">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy} className={button}>
          Save password
        </button>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <h1 className="font-serif text-[length:var(--admin-h1)] font-normal">Set up two-step sign-in</h1>
      {!totpUri ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const password = String(new FormData(e.currentTarget).get('password'));
            void run(async () => {
              const res = await authClient.twoFactor.enable({ password });
              if (res.error || !res.data || !('totpURI' in res.data)) throw new Error('That password is not right.');
              setTotpUri(res.data.totpURI);
              setBackup(res.data.backupCodes);
            });
          }}
        >
          <p className="text-sm text-[var(--mute)]">Super Admins must use an authenticator app. Confirm your password to start.</p>
          <label className="flex flex-col gap-1 text-sm">
            Password
            <input name="password" type="password" autoComplete="current-password" required className={field} />
          </label>
          {error && (
            <p role="alert" className="text-sm text-[var(--red)]">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={button}>
            Continue
          </button>
        </form>
      ) : (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const code = String(new FormData(e.currentTarget).get('code')).replace(/\s/g, '');
            void run(async () => {
              const res = await authClient.twoFactor.verifyTotp({ code });
              if (res.error) throw new Error('That code didn’t work. Try the newest one.');
              done();
            });
          }}
        >
          <p className="text-sm">
            Add this key to your authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code it shows.
          </p>
          <code className="rounded-[var(--radius-control)] bg-[var(--lane)] p-3 font-mono text-xs break-all">
            {new URL(totpUri).searchParams.get('secret')}
          </code>
          <details className="text-sm">
            <summary>Backup codes (save them somewhere safe)</summary>
            <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
              {backup.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </details>
          <label className="flex flex-col gap-1 text-sm">
            6-digit code
            <input
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              className={`${field} font-mono tracking-[0.3em]`}
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-[var(--red)]">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={button}>
            Turn on two-step sign-in
          </button>
        </form>
      )}
    </div>
  );
}
