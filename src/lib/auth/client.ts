'use client';
import { createAuthClient } from 'better-auth/react';
import { emailOTPClient, twoFactorClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  basePath: '/api/auth',
  plugins: [
    // The sign-in form handles the two-factor step itself (twoFactorRedirect).
    twoFactorClient(),
    emailOTPClient(),
  ],
});
