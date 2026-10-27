'use client';
// Admin sign-in, ported from Admin.dc.html: the navy "desk never sleeps" panel
// and a single-column form that walks through every step a person can meet:
//   password → authenticator code (or a backup code)
//   forgot password → emailed code + new password
//   first sign-in → own password → (Super Admins) two-step set-up with a QR code
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { renderSVG } from 'uqr';
import { Icon, type AnyIconName } from '@/components/ui/icon';
import { authClient } from '@/lib/auth/client';

export type Step = 'password' | 'totp' | 'forgot' | 'reset' | 'change-password' | 'enrol-2fa';

type Props = { initial: Step; idle: boolean; idleMinutes: number; resetByEmail: boolean };

const EASE = 'cubic-bezier(0.23,1,0.32,1)';
const mono = 'var(--font-mono)';
const serif = 'var(--font-serif)';
const okEmail = (v: string) => /^\S+@\S+\.\S+$/.test(v.trim());
const rules = (pw: string) => [
  { ok: pw.length >= 8, label: 'At least 8 characters' },
  { ok: /[A-Za-z]/.test(pw), label: 'Letters' },
  { ok: /\d/.test(pw), label: 'At least one number' },
];

/** Better Auth error → words for a person at the front desk. */
function authError(e: { status?: number; code?: string; message?: string } | null | undefined, fallback: string): string {
  if (!e) return fallback;
  if (e.status === 429) return 'Too many tries. Wait a few minutes, or reset your password.';
  if (e.code === 'BANNED_USER' || /banned/i.test(e.message ?? '')) return 'This account has been switched off. Ask a Super Admin.';
  return fallback;
}

export function LoginFlow({ initial, idle, idleMinutes, resetByEmail }: Props) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(initial);
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});
  const [info, setInfo] = useState<string | null>(
    idle ? `You were signed out after ${idleMinutes} minutes without activity. Sign in again to carry on.` : null,
  );
  const [busy, setBusy] = useState(false);

  const go = (s: Step) => {
    setStep(s);
    setError(null);
    setFieldErr({});
  };
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

  const head: Record<Step, { label: string; title: string }> = {
    password: { label: 'A-WISE ADMIN', title: 'Staff sign in' },
    totp: { label: 'TWO-STEP SIGN-IN', title: 'Enter your code' },
    forgot: { label: 'RESET PASSWORD · STEP 1 OF 2', title: 'Forgot your password?' },
    reset: { label: 'RESET PASSWORD · STEP 2 OF 2', title: 'Choose a new password' },
    'change-password': { label: 'FIRST SIGN-IN', title: 'Choose your password' },
    'enrol-2fa': { label: 'FIRST SIGN-IN · TWO-STEP', title: 'Set up two-step sign-in' },
  };

  let body: ReactNode;
  if (step === 'password')
    body = (
      <PasswordStep
        {...{ email, setEmail, busy, run, setFieldErr, fieldErr, setInfo }}
        onTotp={() => go('totp')}
        onDone={done}
        onForgot={() => go('forgot')}
      />
    );
  else if (step === 'totp') body = <TotpStep busy={busy} run={run} onDone={done} onBack={() => go('password')} />;
  else if (step === 'forgot')
    body = (
      <ForgotStep
        {...{ email, setEmail, busy, run, fieldErr, setFieldErr }}
        resetByEmail={resetByEmail}
        onSent={() => go('reset')}
        onBack={() => go('password')}
      />
    );
  else if (step === 'reset')
    body = (
      <ResetStep
        email={email}
        busy={busy}
        run={run}
        fieldErr={fieldErr}
        setFieldErr={setFieldErr}
        onDone={() => {
          go('password');
          setInfo('Password changed. Sign in with your new password.');
        }}
        onBack={() => go('forgot')}
      />
    );
  else if (step === 'change-password')
    body = (
      <ChangeStep busy={busy} run={run} fieldErr={fieldErr} setFieldErr={setFieldErr} onNext={(n) => (n === 'done' ? done() : go(n))} />
    );
  else body = <EnrolStep busy={busy} run={run} onDone={done} />;

  return (
    <div className="aw-login" style={{ minHeight: '100dvh', display: 'grid', background: 'var(--bg)' }}>
      <BrandPanel />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
        <main id="main" style={{ width: 'min(380px,100%)', display: 'flex', flexDirection: 'column', gap: 16, color: 'var(--ink)' }}>
          <div className="aw-login-mark" style={{ alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Mark size={30} stroke="var(--ink)" />
            <span style={{ fontFamily: serif, fontSize: 22, letterSpacing: '-0.01em' }}>Hotel A-Wise</span>
            <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: '0.14em', color: 'var(--mute)', marginTop: 3 }}>ADMIN</span>
          </div>
          <span style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.08em', color: 'var(--mute)' }}>{head[step].label}</span>
          <h1
            key={step}
            tabIndex={-1}
            style={{
              margin: 0,
              fontFamily: serif,
              fontWeight: 400,
              fontSize: 34,
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
              outline: 'none',
            }}
          >
            {head[step].title}
          </h1>
          {info && <Notice tone="ok">{info}</Notice>}
          <div key={step + '-b'} style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: `aw-fade 220ms ${EASE}` }}>
            {body}
          </div>
          {error && <Notice tone="error">{error}</Notice>}
          <span style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--mute)', textAlign: 'center' }}>
            For your security, you’re signed out after {idleMinutes} minutes without activity.
          </span>
        </main>
      </div>
    </div>
  );
}

/* ───────────── steps ───────────── */

type Run = (fn: () => Promise<void>) => Promise<void>;
type Errs = { fieldErr: Record<string, string>; setFieldErr: (e: Record<string, string>) => void };

function PasswordStep(
  p: {
    email: string;
    setEmail: (v: string) => void;
    busy: boolean;
    run: Run;
    setInfo: (v: string | null) => void;
    onTotp: () => void;
    onDone: () => void;
    onForgot: () => void;
  } & Errs,
) {
  const [pw, setPw] = useState('');
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (!okEmail(p.email)) errs.email = 'Enter your work email.';
        if (!pw) errs.password = 'Enter your password.';
        p.setFieldErr(errs);
        if (Object.keys(errs).length) return;
        p.setInfo(null);
        void p.run(async () => {
          const res = await authClient.signIn.email({ email: p.email.trim(), password: pw });
          if (res.error) {
            setPw('');
            throw new Error(authError(res.error, 'That email and password don’t match.'));
          }
          if ((res.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) return p.onTotp();
          p.onDone();
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <Field
        label="Work email"
        icon="mail"
        value={p.email}
        onChange={p.setEmail}
        type="email"
        autoComplete="username"
        placeholder="you@hotelawise.com"
        err={p.fieldErr.email}
        autoFocus
      />
      <Field
        label="Password"
        icon="lock"
        value={pw}
        onChange={setPw}
        type="password"
        autoComplete="current-password"
        placeholder="Your password"
        err={p.fieldErr.password}
      />
      <Submit busy={p.busy} label="Sign in" busyLabel="Signing in…" />
      <LinkButton onClick={p.onForgot}>Forgot your password?</LinkButton>
    </form>
  );
}

function TotpStep({ busy, run, onDone, onBack }: { busy: boolean; run: Run; onDone: () => void; onBack: () => void }) {
  const [code, setCode] = useState('');
  const [backup, setBackup] = useState(false);
  const submit = (value: string) =>
    run(async () => {
      const res = backup
        ? await authClient.twoFactor.verifyBackupCode({ code: value.trim() })
        : await authClient.twoFactor.verifyTotp({ code: value });
      if (res.error) {
        setCode('');
        throw new Error(
          authError(
            res.error,
            backup ? 'That backup code didn’t work. Each code works once.' : 'That code didn’t work. Use the newest one in your app.',
          ),
        );
      }
      onDone();
    });
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (backup ? code.trim().length >= 8 : code.length === 6) void submit(code);
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--mute)' }}>
        {backup
          ? 'Enter one of the backup codes you saved when you set up two-step sign-in. Each code works once.'
          : 'Your account uses two-step sign-in. Enter the 6-digit code from your authenticator app.'}
      </p>
      {backup ? (
        <Field
          label="Backup code"
          icon="key"
          value={code}
          onChange={setCode}
          placeholder="e.g. a1b2c-3d4e5"
          autoComplete="off"
          monoInput
          autoFocus
        />
      ) : (
        <CodeInput
          value={code}
          onChange={(v) => {
            setCode(v);
            if (v.length === 6 && !busy) void submit(v);
          }}
          label="6-digit code"
        />
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <BackButton onClick={onBack} />
        <Submit busy={busy} label="Verify" busyLabel="Checking…" />
      </div>
      <LinkButton
        onClick={() => {
          setBackup(!backup);
          setCode('');
        }}
      >
        {backup ? 'Use my authenticator app instead' : 'Lost your phone? Use a backup code'}
      </LinkButton>
    </form>
  );
}

function ForgotStep(
  p: {
    email: string;
    setEmail: (v: string) => void;
    busy: boolean;
    run: Run;
    resetByEmail: boolean;
    onSent: () => void;
    onBack: () => void;
  } & Errs,
) {
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!okEmail(p.email)) return p.setFieldErr({ email: 'Enter a valid email.' });
        p.setFieldErr({});
        void p.run(async () => {
          const res = await authClient.forgetPassword.emailOtp({ email: p.email.trim() });
          // The same answer whether or not the account exists, so the page can't be used to find staff emails.
          if (res.error?.status === 429) throw new Error('Too many codes asked for. Wait a few minutes, then try again.');
          p.onSent();
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--mute)' }}>
        Enter your work email. We’ll send you a 6-digit code to set a new password.
      </p>
      {!p.resetByEmail && (
        <Notice tone="info">
          Email isn’t switched on for this site yet, so no code can be sent. Ask a Super Admin for a new temporary password.
        </Notice>
      )}
      <Field
        label="Work email"
        icon="mail"
        value={p.email}
        onChange={p.setEmail}
        type="email"
        autoComplete="username"
        placeholder="you@hotelawise.com"
        err={p.fieldErr.email}
        autoFocus
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <BackButton onClick={p.onBack} />
        <Submit busy={p.busy} label="Send code" busyLabel="Sending…" disabled={!p.resetByEmail} />
      </div>
    </form>
  );
}

function ResetStep(p: { email: string; busy: boolean; run: Run; onDone: () => void; onBack: () => void } & Errs) {
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [resent, setResent] = useState(false);
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (code.length !== 6) errs.code = 'Enter the 6-digit code from the email.';
        if (rules(pw).some((r) => !r.ok)) errs.pw = 'Use at least 8 characters, with letters and a number.';
        else if (pw2 !== pw) errs.pw2 = 'The passwords don’t match.';
        p.setFieldErr(errs);
        if (Object.keys(errs).length) return;
        void p.run(async () => {
          const res = await authClient.emailOtp.resetPassword({ email: p.email.trim(), otp: code, password: pw });
          if (res.error)
            throw new Error(authError(res.error, 'That code isn’t right, or it has run out. Check your email or send a new code.'));
          p.onDone();
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--mute)' }}>
        If {p.email.trim() || 'that email'} has an account, we’ve emailed a 6-digit code. It works for 10 minutes.
      </p>
      <Field
        label="6-digit code"
        value={code}
        onChange={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="000000"
        monoInput
        err={p.fieldErr.code}
        autoFocus
      />
      <Field
        label="New password"
        value={pw}
        onChange={setPw}
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        err={p.fieldErr.pw}
      />
      <Rules pw={pw} />
      <Field
        label="Confirm new password"
        value={pw2}
        onChange={setPw2}
        type="password"
        autoComplete="new-password"
        placeholder="Type it again"
        err={p.fieldErr.pw2}
      />
      <LinkButton
        align="start"
        onClick={() =>
          void p.run(async () => {
            await authClient.forgetPassword.emailOtp({ email: p.email.trim() });
            setResent(true);
          })
        }
      >
        {resent ? 'New code sent. Send another' : 'Send a new code'}
      </LinkButton>
      <div style={{ display: 'flex', gap: 8 }}>
        <BackButton onClick={p.onBack} />
        <Submit busy={p.busy} label="Save new password" busyLabel="Saving…" />
      </div>
    </form>
  );
}

function ChangeStep(p: { busy: boolean; run: Run; onNext: (n: Step | 'done') => void } & Errs) {
  const [cur, setCur] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const errs: Record<string, string> = {};
        if (!cur) errs.cur = 'Enter the temporary password you were given.';
        if (rules(pw).some((r) => !r.ok)) errs.pw = 'Use at least 8 characters, with letters and a number.';
        else if (pw === cur) errs.pw = 'Pick a password different from the temporary one.';
        else if (pw2 !== pw) errs.pw2 = 'The passwords don’t match.';
        p.setFieldErr(errs);
        if (Object.keys(errs).length) return;
        void p.run(async () => {
          const res = await fetch('/admin/login/setup', {
            method: 'POST',
            body: JSON.stringify({ action: 'change-password', currentPassword: cur, newPassword: pw }),
          });
          const body = (await res.json().catch(() => ({}))) as { next?: Step | 'done'; error?: string };
          if (!res.ok) throw new Error(body.error ?? 'We couldn’t save that password. Try again.');
          p.onNext(body.next ?? 'done');
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--mute)' }}>
        You signed in with a temporary password. Choose one only you know before you carry on.
      </p>
      <Field
        label="Temporary password"
        value={cur}
        onChange={setCur}
        type="password"
        autoComplete="current-password"
        err={p.fieldErr.cur}
        autoFocus
      />
      <Field
        label="New password"
        value={pw}
        onChange={setPw}
        type="password"
        autoComplete="new-password"
        placeholder="At least 8 characters"
        err={p.fieldErr.pw}
      />
      <Rules pw={pw} />
      <Field
        label="Confirm new password"
        value={pw2}
        onChange={setPw2}
        type="password"
        autoComplete="new-password"
        placeholder="Type it again"
        err={p.fieldErr.pw2}
      />
      <Submit busy={p.busy} label="Save password" busyLabel="Saving…" />
    </form>
  );
}

function EnrolStep({ busy, run, onDone }: { busy: boolean; run: Run; onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [uri, setUri] = useState<string | null>(null);
  const [backup, setBackup] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState<'key' | 'codes' | null>(null);
  const copy = async (what: 'key' | 'codes', text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      /* clipboard blocked: the text is on screen to copy by hand */
    }
  };

  if (!uri) {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!pw) return;
          void run(async () => {
            const res = await authClient.twoFactor.enable({ password: pw });
            if (res.error || !res.data || !('totpURI' in res.data)) throw new Error(authError(res.error, 'That password isn’t right.'));
            setUri(res.data.totpURI);
            setBackup(res.data.backupCodes);
          });
        }}
        style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: 'var(--mute)' }}>
          Super Admins sign in with a code from an authenticator app as well as their password. It takes a minute. Confirm your password to
          start.
        </p>
        <Field label="Password" icon="lock" value={pw} onChange={setPw} type="password" autoComplete="current-password" autoFocus />
        <Submit busy={busy} label="Continue" busyLabel="Checking…" />
      </form>
    );
  }

  const secret = new URL(uri).searchParams.get('secret') ?? '';
  const grouped = secret.replace(/(.{4})/g, '$1 ').trim();
  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (code.length !== 6 || !saved) return;
        void run(async () => {
          const res = await authClient.twoFactor.verifyTotp({ code });
          if (res.error) {
            setCode('');
            throw new Error(authError(res.error, 'That code didn’t work. Use the newest one your app shows.'));
          }
          onDone();
        });
      }}
      style={{ display: 'flex', flexDirection: 'column', gap: 18 }}
    >
      <Numbered n={1} title="Scan the code">
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--mute)' }}>
          Open Google Authenticator, Microsoft Authenticator or 1Password and add an account by scanning.
        </p>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
          <div
            role="img"
            aria-label="QR code for your authenticator app"
            // uqr renders a self-contained SVG from the otpauth URI; no third-party service sees the secret.
            dangerouslySetInnerHTML={{ __html: renderSVG(uri, { border: 2, whiteColor: '#FFFFFF', blackColor: '#00003A' }) }}
            style={{
              width: 148,
              height: 148,
              flexShrink: 0,
              borderRadius: 10,
              overflow: 'hidden',
              border: '1px solid var(--line2)',
              background: '#FFFFFF',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '1 1 160px' }}>
            <span style={{ fontSize: 12.5, color: 'var(--mute)' }}>Can’t scan? Type this key:</span>
            <code
              style={{
                fontFamily: mono,
                fontSize: 13,
                lineHeight: 1.6,
                wordBreak: 'break-all',
                padding: '8px 10px',
                borderRadius: 8,
                background: 'var(--lane)',
              }}
            >
              {grouped}
            </code>
            <SmallButton icon={copied === 'key' ? 'check' : 'clipboard'} onClick={() => copy('key', secret)}>
              {copied === 'key' ? 'Copied' : 'Copy key'}
            </SmallButton>
          </div>
        </div>
      </Numbered>
      <Numbered n={2} title="Save your backup codes">
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.5, color: 'var(--mute)' }}>
          If you lose your phone, each of these lets you in once. Keep them somewhere safe, away from your phone.
        </p>
        <ul
          aria-label="Backup codes"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: 12,
            borderRadius: 10,
            background: 'var(--lane)',
            display: 'grid',
            gridTemplateColumns: 'repeat(2,minmax(0,1fr))',
            gap: '6px 16px',
            fontFamily: mono,
            fontSize: 13,
          }}
        >
          {backup.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <SmallButton icon={copied === 'codes' ? 'check' : 'clipboard'} onClick={() => copy('codes', backup.join('\n'))}>
            {copied === 'codes' ? 'Copied' : 'Copy codes'}
          </SmallButton>
          <SmallButton
            icon="download"
            onClick={() => {
              const a = document.createElement('a');
              a.href =
                'data:text/plain;charset=utf-8,' +
                encodeURIComponent(`Hotel A-Wise admin backup codes\nEach works once.\n\n${backup.join('\n')}\n`);
              a.download = 'hotel-a-wise-backup-codes.txt';
              a.click();
            }}
          >
            Download
          </SmallButton>
        </div>
        <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.45, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            style={{ width: 18, height: 18, marginTop: 1, accentColor: 'var(--pri-bg)' }}
          />
          I’ve saved my backup codes somewhere safe.
        </label>
      </Numbered>
      <Numbered n={3} title="Enter the code your app shows">
        <CodeInput value={code} onChange={setCode} label="6-digit code" />
      </Numbered>
      <Submit busy={busy} label="Turn on two-step sign-in" busyLabel="Checking…" disabled={!saved || code.length !== 6} />
      {!saved && (
        <span style={{ fontSize: 12, color: 'var(--mute)', textAlign: 'center', marginTop: -8 }}>
          Tick the box once your backup codes are saved.
        </span>
      )}
    </form>
  );
}

/* ───────────── pieces ───────────── */

function BrandPanel() {
  const [clock, setClock] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(`${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`);
    };
    tick();
    const t = setInterval(tick, 15000);
    return () => clearInterval(t);
  }, []);
  return (
    <div
      className="aw-login-brand"
      style={{ background: '#00003A', color: '#F5F2EA', padding: 48, flexDirection: 'column', justifyContent: 'space-between' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Mark size={40} stroke="#F2B544" />
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontFamily: serif, fontSize: 26, letterSpacing: '-0.01em', lineHeight: 1, whiteSpace: 'nowrap' }}>
            Hotel A-Wise
          </span>
          <span style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: '0.14em', opacity: 0.6 }}>STAFF ADMIN</span>
        </span>
      </div>
      <p style={{ margin: 0, fontFamily: serif, fontSize: 48, lineHeight: 1.02, letterSpacing: '-0.03em' }}>
        The desk never sleeps.
        <br />
        <em style={{ fontWeight: 300 }}>You’re allowed to.</em>
      </p>
      <span style={{ fontFamily: mono, fontSize: 12, opacity: 0.7 }}>A-WISE ADMIN · {clock ?? '--:--'} GMT</span>
    </div>
  );
}

function Mark({ size, stroke }: { size: number; stroke: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      width={size}
      height={size}
      fill="none"
      stroke={stroke}
      strokeWidth="1.3"
      aria-hidden="true"
      style={{ flexShrink: 0 }}
    >
      <circle cx="11" cy="11" r="5.5" />
      <circle cx="21" cy="11" r="5.5" />
      <circle cx="11" cy="21" r="5.5" />
      <circle cx="21" cy="21" r="5.5" />
      <rect x="12.5" y="12.5" width="7" height="7" transform="rotate(45 16 16)" />
    </svg>
  );
}

function Field(p: {
  label: string;
  icon?: AnyIconName;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  placeholder?: string;
  inputMode?: 'numeric';
  err?: string;
  autoFocus?: boolean;
  monoInput?: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const [caps, setCaps] = useState(false);
  const isPw = p.type === 'password';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: 'var(--mute)' }}>
      <label htmlFor={id} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {p.icon && <Icon name={p.icon} size={14} />}
        {p.label}
      </label>
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          value={p.value}
          onChange={(e) => p.onChange(e.target.value)}
          onKeyUp={(e) => isPw && setCaps(e.getModifierState('CapsLock'))}
          onBlur={() => setCaps(false)}
          type={isPw && show ? 'text' : (p.type ?? 'text')}
          inputMode={p.inputMode}
          autoComplete={p.autoComplete}
          placeholder={p.placeholder}
          autoFocus={p.autoFocus}
          spellCheck={false}
          autoCapitalize="off"
          aria-invalid={p.err ? true : undefined}
          aria-describedby={p.err ? `${id}-err` : undefined}
          style={{
            width: '100%',
            height: 44,
            padding: isPw ? '0 64px 0 12px' : '0 12px',
            borderRadius: 8,
            border: `1px solid ${p.err ? 'var(--red)' : 'var(--field)'}`,
            background: 'var(--panel)',
            color: 'var(--ink)',
            fontSize: 14,
            fontFamily: p.monoInput ? mono : undefined,
            letterSpacing: p.monoInput ? '0.2em' : undefined,
          }}
        />
        {isPw && (
          <button
            type="button"
            onClick={() => setShow(!show)}
            aria-label={show ? 'Hide password' : 'Show password'}
            aria-pressed={show}
            style={{
              position: 'absolute',
              right: 6,
              top: 6,
              height: 32,
              padding: '0 10px',
              border: 'none',
              borderRadius: 6,
              background: 'transparent',
              color: 'var(--mute)',
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
      {caps && !p.err && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--amber-ink)' }}>
          <Icon name="alert" size={13} />
          Caps Lock is on.
        </span>
      )}
      {p.err && (
        <span id={`${id}-err`} role="alert" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--red)' }}>
          <Icon name="alert" size={13} />
          {p.err}
        </span>
      )}
    </div>
  );
}

/** One big field for the 6 digits; paste-friendly, digits only. */
function CodeInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <input
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      aria-label={label}
      placeholder="000000"
      style={{
        height: 56,
        padding: '0 16px',
        borderRadius: 8,
        border: '1px solid var(--field)',
        background: 'var(--panel)',
        color: 'var(--ink)',
        fontFamily: mono,
        fontSize: 26,
        letterSpacing: '0.4em',
        textAlign: 'center',
      }}
    />
  );
}

function Rules({ pw }: { pw: string }) {
  return (
    <ul
      aria-label="Password rules"
      style={{ listStyle: 'none', margin: '-6px 0 0', padding: 0, display: 'flex', gap: '4px 14px', flexWrap: 'wrap', fontSize: 12 }}
    >
      {rules(pw).map((r) => (
        <li
          key={r.label}
          style={{ display: 'flex', alignItems: 'center', gap: 5, color: r.ok ? 'var(--green)' : 'var(--mute)', transition: 'color 150ms' }}
        >
          <Icon name={r.ok ? 'check' : 'info'} size={13} />
          {r.label}
          <span className="sr-only">{r.ok ? ' (done)' : ' (still needed)'}</span>
        </li>
      ))}
    </ul>
  );
}

function Numbered({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 500 }}>
        <span
          aria-hidden="true"
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: 'var(--chip-bg)',
            color: 'var(--chip-fg)',
            fontFamily: mono,
            fontSize: 11,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {n}
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Notice({ tone, children }: { tone: 'ok' | 'error' | 'info'; children: ReactNode }) {
  const color = tone === 'ok' ? 'var(--green)' : tone === 'error' ? 'var(--red)' : 'var(--mute)';
  return (
    <span
      role={tone === 'error' ? 'alert' : 'status'}
      style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 13, lineHeight: 1.5, color }}
    >
      <Icon name={tone === 'ok' ? 'check' : tone === 'error' ? 'alert' : 'info'} size={14} style={{ marginTop: 3 }} />
      <span>{children}</span>
    </span>
  );
}

function Submit({ busy, label, busyLabel, disabled }: { busy: boolean; label: string; busyLabel: string; disabled?: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy || disabled}
      aria-busy={busy || undefined}
      className="aw-press"
      style={{
        flex: '1 0 auto',
        minHeight: 46,
        height: 46,
        border: 'none',
        borderRadius: 8,
        background: 'var(--pri-bg)',
        color: 'var(--pri-fg)',
        fontSize: 14,
        fontWeight: 500,
      }}
    >
      {busy ? busyLabel : label}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        height: 46,
        padding: '0 16px',
        borderRadius: 8,
        border: '1px solid var(--line2)',
        background: 'transparent',
        color: 'var(--ink)',
        fontSize: 14,
      }}
    >
      Back
    </button>
  );
}

function LinkButton({ onClick, children, align = 'center' }: { onClick: () => void; children: ReactNode; align?: 'center' | 'start' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        alignSelf: align === 'center' ? 'center' : 'flex-start',
        whiteSpace: 'nowrap',
        height: 40,
        padding: align === 'center' ? '0 8px' : 0,
        border: 'none',
        background: 'transparent',
        color: 'var(--ink)',
        fontSize: 13.5,
        textDecoration: 'underline',
        textUnderlineOffset: 3,
      }}
    >
      {children}
    </button>
  );
}

function SmallButton({ icon, onClick, children }: { icon: AnyIconName; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 34,
        padding: '0 12px',
        borderRadius: 8,
        border: '1px solid var(--line2)',
        background: 'var(--panel)',
        color: 'var(--ink)',
        fontSize: 12.5,
      }}
    >
      <Icon name={icon} size={14} />
      {children}
    </button>
  );
}
