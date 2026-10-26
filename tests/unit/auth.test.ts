import { describe, expect, it } from 'vitest';
import { passwordProblem } from '@/server/auth/password';
import { authorize, pendingSetup, SetupRequiredError, type ActorRecord } from '@/server/auth/actor';
import { ForbiddenError } from '@/server/auth/permissions';
import { diff } from '@/server/services/audit';

const base: ActorRecord = {
  id: 'u',
  name: 'Esi',
  email: 'esi@hotelawise.com',
  jobTitle: '',
  role: 'super_admin',
  grants: [],
  active: true,
  twoFactorEnabled: true,
  twoFactorRequired: true,
  mustChangePassword: false,
};

describe('password rule', () => {
  it('enforces the Handoff password rule', () => {
    expect(passwordProblem('short1')).toMatch(/8 characters/);
    expect(passwordProblem('nonumbers')).toMatch(/number/);
    expect(passwordProblem('12345678')).toMatch(/letters/);
    expect(passwordProblem('a1'.repeat(37))).toMatch(/72/);
    expect(passwordProblem('a1'.repeat(36))).toBeNull();
    expect(passwordProblem('kente2026')).toBeNull();
  });
});

describe('authorize', () => {
  it('requires TOTP for Super Admins and a new password after a reset', () => {
    expect(pendingSetup({ ...base, twoFactorEnabled: false })).toBe('enrol-2fa');
    expect(pendingSetup({ ...base, role: 'staff', twoFactorEnabled: false })).toBeNull();
    expect(pendingSetup({ ...base, twoFactorEnabled: false, twoFactorRequired: false })).toBeNull();
    expect(pendingSetup({ ...base, mustChangePassword: true })).toBe('change-password');
    expect(() => authorize({ ...base, twoFactorEnabled: false }, 'dashboard.view')).toThrow(SetupRequiredError);
  });
  it('applies the permission matrix', () => {
    expect(authorize(base, 'audit.view')).toBe(base);
    expect(() => authorize({ ...base, role: 'staff' }, 'audit.view')).toThrow(ForbiddenError);
    expect(() => authorize(null, 'dashboard.view')).toThrow(ForbiddenError);
  });
});

describe('audit diff', () => {
  it('keeps only changed fields', () => {
    expect(diff({ price: 24000, name: 'EXE+' }, { price: 25000, name: 'EXE+' })).toEqual({
      before: { price: 24000 },
      after: { price: 25000 },
    });
    expect(diff(null, { a: 1 })).toEqual({ before: null, after: { a: 1 } });
  });
});
