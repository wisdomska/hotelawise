'use server';
// Users & permissions actions (Super Admins). Each is audited by the service.
import { z } from 'zod';
import { done, fail } from '@/lib/admin/result';
import { act } from '@/server/admin/act';
import { inviteUser, JOB_TITLES, resetPassword, setActive, setGrant, updateRole } from '@/server/admin/users';
import { GRANTS, type Role } from '@/server/auth/permissions';
import { env } from '@/server/platform/env';

const id = z.string().min(1).max(100);

/** "Super Admin" or "Staff · Front desk" → role and job title. */
function parseRole(v: string): { role: Role; jobTitle: string } | null {
  if (v === 'Super Admin') return { role: 'super_admin', jobTitle: '' };
  const m = /^Staff(?: · (.+))?$/.exec(v);
  if (!m) return null;
  const title = m[1] ?? '';
  if (title && !(JOB_TITLES as readonly string[]).includes(title)) return null;
  return { role: 'staff', jobTitle: title };
}

async function mail(to: string, subject: string, text: string) {
  try {
    const { sendEmail } = await import('@/server/integrations/email');
    await sendEmail(to, subject, text);
    return true;
  } catch (e) {
    console.warn('admin email not sent', e instanceof Error ? e.message : e);
    return false;
  }
}

const signInText = (name: string, password: string) =>
  `Hello ${name.split(' ')[0]},\n\nYou can sign in to the Hotel A-Wise admin at ${env().APP_URL}/admin/login\n\nTemporary password: ${password}\n\nYou'll choose your own password when you first sign in.`;

export async function inviteAction(raw: { name: string; email: string; role: string }) {
  const errs: Record<string, string> = {};
  const name = raw.name.trim();
  const email = raw.email.trim().toLowerCase();
  if (name.length < 2) errs.name = 'Enter their name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email.';
  const r = parseRole(raw.role);
  if (!r) errs.role = 'Pick a role.';
  if (Object.keys(errs).length || !r) return fail('Check the highlighted fields.', errs);
  return act('users.manage', async (tx, who) => {
    const out = await inviteUser(tx, who, { name: name.slice(0, 80), email, ...r });
    const sent = await mail(out.email, 'Your Hotel A-Wise admin account', signInText(name, out.password));
    return done('Invite created.', sent ? `Sign-in details emailed to ${out.email}.` : 'Share the temporary password with them yourself.', {
      email: out.email,
      password: out.password,
      emailed: sent,
    });
  });
}

export async function changeRoleAction(userId: string, roleText: string) {
  const r = parseRole(roleText);
  if (!r) return fail('Pick a role.', { role: 'Pick a role.' });
  return act('users.manage', async (tx, who) => {
    const out = await updateRole(tx, who, id.parse(userId), r.role, r.jobTitle);
    return done('Role updated.', `${out.name} is now ${out.label}.`);
  });
}

export async function setActiveAction(userId: string, active: boolean) {
  return act('users.manage', async (tx, who) => {
    const out = await setActive(tx, who, id.parse(userId), active);
    return done(
      active ? `${out.name} reactivated.` : `${out.name} deactivated.`,
      active ? 'They can sign in again.' : 'Signed out everywhere.',
    );
  });
}

export async function resetPasswordAction(userId: string) {
  return act('users.manage', async (tx, who) => {
    const out = await resetPassword(tx, who, id.parse(userId));
    const sent = await mail(out.email, 'Your Hotel A-Wise admin password was reset', signInText(out.name, out.password));
    return done(
      'Password reset.',
      sent ? `New sign-in details emailed to ${out.email}.` : 'Share the temporary password with them yourself.',
      {
        email: out.email,
        password: out.password,
        emailed: sent,
      },
    );
  });
}

export async function setGrantAction(userId: string, key: string, enabled: boolean) {
  const grant = z.enum(GRANTS).parse(key);
  return act('users.manage', async (tx, who) => {
    const out = await setGrant(tx, who, id.parse(userId), grant, enabled);
    return done('Permission updated.', `${out.name}: ${enabled ? 'on' : 'off'}.`);
  });
}
