'use server';
// My account: anyone signed in can change their own name, email and password.
import { headers } from 'next/headers';
import { done, fail } from '@/lib/admin/result';
import { act } from '@/server/admin/act';
import { changeMyEmail, changeMyName, changeMyPassword } from '@/server/admin/users';
import { passwordProblem } from '@/server/auth/password';
import { getAuth } from '@/server/auth/session';

// Every signed-in admin has the dashboard, so it stands for "signed in".
const SIGNED_IN = 'dashboard.view';

export async function changeNameAction(raw: { name: string }) {
  const name = raw.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) return fail('Enter your full name.', { name: 'Enter your full name.' });
  return act(SIGNED_IN, async (tx, who) => {
    await changeMyName(tx, who, name);
    return done('Name updated.', 'The sidebar and audit log use it from now on.');
  });
}

export async function changeEmailAction(raw: { email: string; pw: string }) {
  const email = raw.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Enter a valid email.', { email: 'Enter a valid email.' });
  return act(
    SIGNED_IN,
    async (tx, who) => {
      const out = await changeMyEmail(tx, who, email);
      try {
        const { sendEmail } = await import('@/server/integrations/email');
        await sendEmail(
          out.old,
          'Your Hotel A-Wise admin email changed',
          `The sign-in email for your Hotel A-Wise admin account is now ${out.next}. If you didn't do this, tell a Super Admin straight away.`,
        );
      } catch {
        // The change stands; the note to the old address is a courtesy.
      }
      return done('Email updated.', 'Use it next time you sign in.');
    },
    { password: raw.pw },
  );
}

export async function changePasswordAction(raw: { pw: string; npw: string; npw2: string }) {
  const problem = passwordProblem(raw.npw);
  if (problem) return fail(problem, { npw: problem });
  if (raw.npw !== raw.npw2) return fail('The passwords don’t match.', { npw2: 'The passwords don’t match.' });
  if (raw.npw === raw.pw) return fail('Choose a password you haven’t used here.', { npw: 'Choose a different password.' });
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  return act(
    SIGNED_IN,
    async (tx, who) => {
      await changeMyPassword(tx, who, raw.npw, session?.session.id ?? null);
      return done('Password changed.', 'Other devices were signed out. Use it next time you sign in.');
    },
    { password: raw.pw },
  );
}
