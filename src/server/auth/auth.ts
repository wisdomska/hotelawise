// Better Auth for /admin only (guests never sign in). Email + password, TOTP
// two-factor (required for Super Admins, enforced in requireActor), emailed
// 6-digit reset codes valid for 10 minutes, and a 30-minute idle session.
import { eq } from 'drizzle-orm';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { emailOTP, twoFactor } from 'better-auth/plugins';
import * as schema from '@/server/db/schema';
import type { AnyDb } from '@/server/services/holds';
import { createPasswordHasher, MAX_PASSWORD_BYTES, passwordProblem } from './password';

export const IDLE_TIMEOUT_SECONDS = 30 * 60;

export type AuthDeps = {
  db: AnyDb;
  secret: string;
  baseURL: string;
  /** Sends the 6-digit password-reset code (Resend in production). */
  sendResetCode: (email: string, code: string) => Promise<void>;
  /** Records sign-in attempts for login history and lockout. */
  onSignInAttempt?: (e: { email: string; success: boolean; ip: string | null; userAgent: string | null }) => Promise<void>;
};

const PASSWORD_PATHS = new Set(['/email-otp/reset-password', '/change-password', '/reset-password']);

export function createAuth(deps: AuthDeps) {
  return betterAuth({
    appName: 'Hotel A-Wise Admin',
    secret: deps.secret,
    baseURL: deps.baseURL,
    basePath: '/api/auth',
    database: drizzleAdapter(deps.db, {
      provider: 'pg',
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        twoFactor: schema.twoFactor,
        rateLimit: schema.authRateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true, // staff are invited from Users & permissions
      minPasswordLength: 8,
      maxPasswordLength: MAX_PASSWORD_BYTES,
      password: createPasswordHasher(deps.db),
      revokeSessionsOnPasswordReset: true,
    },
    user: {
      additionalFields: {
        role: { type: 'string', input: false, defaultValue: 'staff' },
        banned: { type: 'boolean', input: false, defaultValue: false },
        mustChangePassword: { type: 'boolean', input: false, defaultValue: false },
      },
      changeEmail: { enabled: true },
    },
    session: {
      // Sliding 30-minute idle timeout: every request refreshes the expiry.
      expiresIn: IDLE_TIMEOUT_SECONDS,
      updateAge: 60,
      freshAge: 5 * 60, // money and key-reveal actions need a session (or re-auth) this fresh
    },
    advanced: {
      cookiePrefix: 'aw',
      useSecureCookies: deps.baseURL.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', path: '/' },
      ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] },
    },
    // Handoff: sign-in locks for 30 s after 5 tries. Per client IP (cf-connecting-ip).
    // Counted in Postgres so every Worker isolate shares the lockout (DECISIONS D-40).
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 30,
      customRules: {
        '/sign-in/email': { window: 30, max: 5 },
        '/two-factor/verify-totp': { window: 30, max: 5 },
        '/two-factor/verify-backup-code': { window: 30, max: 5 },
        '/email-otp/send-verification-otp': { window: 60, max: 3 },
        '/forget-password/email-otp': { window: 60, max: 3 },
        '/email-otp/reset-password': { window: 60, max: 5 },
      },
    },
    trustedOrigins: [deps.baseURL],
    plugins: [
      twoFactor({ issuer: 'Hotel A-Wise', backupCodeOptions: { amount: 10 } }),
      emailOTP({
        otpLength: 6,
        expiresIn: 10 * 60,
        allowedAttempts: 5,
        storeOTP: 'hashed',
        disableSignUp: true,
        async sendVerificationOTP({ email, otp, type }) {
          if (type === 'forget-password') await deps.sendResetCode(email, otp);
        },
      }),
      nextCookies(),
    ],
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (PASSWORD_PATHS.has(ctx.path)) {
          const body = (ctx.body ?? {}) as { password?: string; newPassword?: string };
          const pw = body.newPassword ?? body.password;
          const problem = pw ? passwordProblem(pw) : null;
          if (problem) throw new APIError('BAD_REQUEST', { message: problem });
        }
      }),
      after: createAuthMiddleware(async (ctx) => {
        if (ctx.path !== '/sign-in/email' || !deps.onSignInAttempt) return;
        const body = (ctx.body ?? {}) as { email?: string };
        const returned = ctx.context.returned;
        await deps.onSignInAttempt({
          email: String(body.email ?? '').toLowerCase(),
          success: !(returned instanceof APIError),
          ip: ctx.request?.headers.get('cf-connecting-ip') ?? null,
          userAgent: ctx.request?.headers.get('user-agent') ?? null,
        });
      }),
    },
    databaseHooks: {
      session: {
        create: {
          // Deactivated accounts can't sign in.
          before: async (session) => {
            const [u] = await deps.db.select({ banned: schema.user.banned }).from(schema.user).where(eq(schema.user.id, session.userId));
            if (!u || u.banned) throw new APIError('FORBIDDEN', { message: 'This account is deactivated.' });
            return { data: session };
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
