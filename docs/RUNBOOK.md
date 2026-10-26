# Runbook

How to deploy, roll back and handle common problems. Commands that touch Cloudflare need `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in your shell.

## Deploy

1. Merge a pull request into `preview`. The Deploy workflow migrates the preview database, builds the Worker and deploys it.
2. Check the preview site: booking, rentals, venues and the admin.
3. Open a pull request from `preview` into `main`, then merge it. Production deploys the same way.

The preview can also be deployed by hand with `pnpm cf:deploy:preview`.

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

Worker secrets: `DATABASE_URL`, `BETTER_AUTH_SECRET`, `REF_SECRET`, `PAYSTACK_SECRET_KEY`, `RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`, `SMS_API_KEY`, `CLOUDINARY_API_SECRET`, and `PREVIEW_PASSWORD` (preview only). Public values live in `wrangler.jsonc`. GitHub environment secrets (`preview`, `production`): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL_MIGRATE`.

## Rotate a secret

When a key is exposed, or a person with access leaves:

1. Create a new key at the provider (Paystack, Resend, Cloudinary, Neon, Cloudflare, GitHub).
2. Set it with `wrangler secret put` (and in GitHub environment secrets if it's listed there).
3. Revoke the old key at the provider.
4. `BETTER_AUTH_SECRET`: changing it signs every staff member out. `REF_SECRET`: changing it invalidates open guest codes and manage-booking passes, but not existing bookings.

## Payments

- **The Paystack webhook** is `https://<site>/api/paystack/webhook`. Set it in the Paystack dashboard → Settings → API Keys & Webhooks, for test and live separately.
- **A guest paid but the booking still shows unpaid:** the confirmation page checks Paystack when the guest returns, and each webhook retry settles the payment. To force a settle, resend the event from the Paystack dashboard (Transactions → the transaction → Resend webhook). Settling is idempotent, so a resend never charges or confirms twice.
- **Payment arrived after the hold ran out:** the app gives the guest another room of the same type, or re-checks rental stock. If nothing is free, it refunds through Paystack and tells the guest and the desk.

## Scheduled jobs

Defined in `wrangler.jsonc`, run by `src/worker/scheduled.ts`:

| Schedule (UTC = Accra time) | Job                                                            |
| --------------------------- | -------------------------------------------------------------- |
| every 15 minutes            | Release expired holds                                          |
| 07:00 daily                 | Guest and pickup reminders (milestone 6)                       |
| 02:00 daily                 | Housekeeping: old rate-limit rows, expired codes (milestone 6) |

To see recent runs: Cloudflare dashboard → Workers → the Worker → Logs, or `pnpm exec wrangler tail --env production`.

## Preview site password

The preview asks for a password (any username). To change it: `pnpm exec wrangler secret put PREVIEW_PASSWORD --env preview`.
