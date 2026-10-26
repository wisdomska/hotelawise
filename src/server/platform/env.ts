// Server configuration. On Workers, vars and secrets are exposed on process.env
// (nodejs_compat); in Node (next dev, scripts, tests) they come from .env.local.
import { z } from 'zod';

const schema = z.object({
  APP_ENV: z.enum(['development', 'preview', 'production']).default('development'),
  APP_URL: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1),
  DATABASE_DRIVER: z.enum(['neon', 'pg']).default('neon'),
  BETTER_AUTH_SECRET: z.string().min(32),
  REF_SECRET: z.string().min(16),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default('Hotel A-Wise <bookings@hotelawise.com>'),
  PAYSTACK_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: z.string().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
  UPSTASH_REDIS_REST_URL: z.string().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  SMS_PROVIDER: z.enum(['arkesel', 'hubtel']).optional(),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().optional(),
});

export type ServerEnv = z.infer<typeof schema>;

let cached: ServerEnv | undefined;

export function env(): ServerEnv {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
      throw new Error(`Server configuration is incomplete: ${missing}`);
    }
    cached = parsed.data;
  }
  return cached;
}

export const isProduction = () => env().APP_ENV === 'production';
