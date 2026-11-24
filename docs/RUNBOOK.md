# Runbook

How to deploy, roll back and handle common problems. Commands that touch Cloudflare need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell.

## Deploy

1. Merge a pull request into `preview`. The Deploy workflow migrates the preview database, builds the Worker and deploys it.
2. Check the preview site: booking, rentals, venues and the admin.
3. Open a pull request from `preview` into `main`, then merge it. Production deploys the same way.

To release a version, raise `version` in `package.json` and add its section to `CHANGELOG.md` in the same pull request. When it reaches `main`, the Release workflow tags the commit (`v1.2.3`) and publishes a GitHub release with that section as its notes.

The preview can also be deployed by hand with `pnpm cf:deploy:preview`, and production with `pnpm cf:deploy:production`.

## First production launch

Production is `https://hotelawise.wisdomska.workers.dev` until the hotel's domain is ready. The Worker doesn't exist until the first deploy; its KV namespace and D1 tag database already do (ids in `wrangler.jsonc`).

1. Migrate the production database (Neon `production` branch, direct connection):
   ```bash
   DATABASE_URL="<production direct URL>" pnpm db:migrate
   ```
2. Deploy once to create the Worker: `pnpm cf:deploy:production`.
3. Set its secrets (each prompts for the value):
   ```bash
   for s in DATABASE_URL BETTER_AUTH_SECRET REF_SECRET TURNSTILE_SECRET_KEY CLOUDINARY_API_KEY CLOUDINARY_API_SECRET; do
     pnpm exec wrangler secret put $s --env production
   done
   ```
   - `DATABASE_URL`: the production **pooled** URL.
   - `BETTER_AUTH_SECRET` and `REF_SECRET`: new random values, never the preview ones (`openssl rand -base64 48`).
   - `TURNSTILE_SECRET_KEY`: the secret of the `hotelawise` widget (Cloudflare → Turnstile).
   - Leave `PAYSTACK_SECRET_KEY` unset until the live keys arrive: the site then offers only "Pay at the hotel" and "Pay when you collect". Then set it with the **live** secret key, add `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` (live public key) to the production `vars`, set the live webhook URL in Paystack, and deploy.
   - `RESEND_API_KEY` and `SMS_API_KEY` (+ `SMS_PROVIDER=arkesel`, `SMS_SENDER_ID`) when those accounts exist; until then no email or SMS goes out.
4. Check: `/api/health` answers 200, the home page and `/admin/login` load, sign in as the first Super Admin (`scripts/create-super-admin.ts` if none exists yet).
5. Before taking real money: Settings › Security › require two-step sign-in, and enrol every Super Admin.

## Roll back

Code: open Cloudflare dashboard → Workers → the Worker → Deployments and roll back to the last good version. From a terminal:

```bash
pnpm exec wrangler deployments list --env production
pnpm exec wrangler rollback <version-id> --env production
```

Then revert the bad commit on `main` so the next deploy doesn't bring it back.

Database: migrations only move forward. Don't edit an applied migration; write a new one that undoes the change. If data is damaged, restore a Neon branch to a point before the incident (Neon console → Branches → Restore), check it, then point `DATABASE_URL` at it. The free plan's restore window is short, so act quickly.

## Set or change a secret

```bash
pnpm exec wrangler secret put PAYSTACK_SECRET_KEY --env production   # prompts for the value
pnpm exec wrangler secret list --env production
```

Worker secrets: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `REF_SECRET`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `SMS_API_KEY`, `CLOUDINARY_API_SECRET`, and `PREVIEW_PASSWORD` (preview only). Public values live in `wrangler.jsonc`. GitHub repository secrets (Settings → Secrets and variables → Actions): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL_MIGRATE_PRODUCTION`, `DATABASE_URL_MIGRATE_PREVIEW`.

## Rotate a secret

When a key is exposed, or a person with access leaves:

1. Create a new key at the provider (Paystack, Resend, Cloudinary, Neon, Cloudflare, GitHub).
2. Set it with `wrangler secret put` (and in the GitHub repository secrets if it's listed there).
3. Revoke the old key at the provider.
4. `BETTER_AUTH_SECRET`: changing it signs every staff member out. `REF_SECRET`: changing it invalidates open guest codes and manage-booking passes, but not existing bookings.

## Payments

- **The Paystack webhook** is `https://<site>/api/paystack/webhook`. Set it in the Paystack dashboard → Settings → API Keys & Webhooks, for test and live separately.
- **A guest paid but the booking still shows unpaid:** the confirmation page checks Paystack when the guest returns, and each webhook retry settles the payment. To force a settle, resend the event from the Paystack dashboard (Transactions → the transaction → Resend webhook). Settling is idempotent, so a resend never charges or confirms twice.
- **Payment arrived after the hold ran out:** the app gives the guest another room of the same type, or re-checks rental stock. If nothing is free, it refunds through Paystack and tells the guest and the desk.

## Scheduled jobs

Each Worker has one Cron Trigger, at 02:00, 07:00 and 10:00 Accra (`wrangler.jsonc`; the free plan allows 5 per account, DECISIONS D-50 and D-59). `src/worker/scheduled.ts` turns each run into internal `POST /api/cron/<job>` calls (D-43), adding the daily jobs on the 07:00 and 02:00 runs. They run `src/server/services/jobs.ts`:

| Schedule (UTC = Accra time) | Job                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------- |
| every 15 minutes            | Release expired booking holds; cancel pay-at-pickup orders not paid by 10:00 on pickup day (customer told) |
| 07:00 daily                 | Day-before reminders: check-in, rental pickup, rental return (max 60 a run)                                |
| 02:00 daily                 | Housekeeping: spent codes, finished rate-limit windows, expired sessions, sign-in history over 180 days    |

Each run logs its counts, e.g. `{"checkIn":2,"pickup":1,"returns":0}`. Reminders are stamped on the booking or order when sent, so re-running a job is safe. To try a job locally: `pnpm exec wrangler dev --env preview --test-scheduled`, then open `http://localhost:8787/__scheduled?cron=0+7+*+*+*`.

To see recent runs: Cloudflare dashboard → Workers → the Worker → Logs, or `pnpm exec wrangler tail --env production`.

## Preview site password

The preview is open without a password at the owner's request (DECISIONS D-41) and is never indexed. To put the password back: set `PREVIEW_GATE` to `on` in `wrangler.jsonc` (preview vars), set `pnpm exec wrangler secret put PREVIEW_PASSWORD --env preview`, and deploy.

## Admin locked out

- **Forgot password:** "Forgot your password?" on the sign-in page emails a code (needs `RESEND_API_KEY`). Without email, a Super Admin resets the person from Users & permissions, which shows a new temporary password once.
- **No Super Admin can sign in:** run `scripts/reset-password.ts` with `DATABASE_URL`, `RESET_EMAIL` and `RESET_TEMP_PASSWORD` set; it sets a temporary password, clears bans and signs the account out everywhere.
- **"Too many tries":** sign-in locks for 30 seconds after 5 tries from one address; money and account actions after 5 wrong passwords in 5 minutes. Wait and try again.

## Site shows "This page couldn't load"

Open the browser console. If scripts under `/_next/static/` fail, check that the build renamed bracketed folders (the `webpack` hook in `next.config.ts`): route groups like `(site)` in script paths make some browsers loop on Cloudflare's static file redirect.
