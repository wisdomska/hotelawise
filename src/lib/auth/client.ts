'use client';
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [
    twoFactorClient({ onTwoFactorRedirect: () => window.location.assign('/admin/login?step=2fa') }),
    emailOTPClient(),
  ],
});
