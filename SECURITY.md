# Security

## Reporting a problem

Please don't open a public issue. Use GitHub's private vulnerability reporting (Security → Report a vulnerability) or contact the repository owner directly. Include what you found, how to reproduce it, and what it affects. You'll get a reply within three working days.

## What this app protects

- **Guest data:** names, phone numbers, emails and booking history.
- **Payments:** handled by Paystack. Card and MoMo details never reach our servers. We store only Paystack references and amounts.
- **The admin:** staff accounts, roles and the audit log.

## How it protects it

- Payment confirmation comes only from Paystack verification. Webhooks are checked with HMAC-SHA512 and processed idempotently.
- Prices, stock and availability are recomputed on the server for every booking and order.
- Guests manage a booking only with a 6-digit code sent to the phone or email on file. Codes are hashed, expire after 10 minutes, and allow 5 tries.
- Admin passwords use Better Auth's default hashing. Super Admins must use TOTP two-step sign-in. Sessions time out when idle.
- Roles and permissions are enforced on the server for every page and action. Forbidden requests get a 403.
- Holds, orders, sign-in and every form are rate-limited, and public forms use Cloudflare Turnstile.
- The preview site sits behind a password and is never indexed.

## Secrets

- Never commit secrets. Local values live in `.env.local` / `.dev.vars` (git-ignored). Deployed values are Worker secrets (`wrangler secret put`) and GitHub environment secrets.
- Production uses Paystack **live** keys. Everything else uses **test** keys.
- If a secret is exposed (committed, pasted into chat, sent by email), rotate it at the provider straight away. The steps are in [docs/RUNBOOK.md](docs/RUNBOOK.md#rotate-a-secret).
