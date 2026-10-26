# Security checklist

The release review for v1.0.0, laid out along the OWASP ASVS 4.0 Level 2 chapters that apply to this app. "Done" means the control is in the code and covered by a test or a check named here. To report a problem, see [SECURITY.md](../SECURITY.md).

## Found and fixed in the release review

An independent read of the code, before release, found five problems. All are fixed, with tests:

| #   | Severity    | Problem                                                                                                                                                                                                                          | Fix                                                                                                                                                                                                                              |
| --- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | High        | The password re-check on money and account actions was skipped when a request left the password field out, so a stolen session could refund, record payments, change the email or change the password without knowing it.        | `act()` now refuses whenever the step-up is asked for and the password is missing, empty or not a string, and limits guesses to 5 per 5 minutes per user. A Super Admin's return checklist always asks. `tests/unit/act.test.ts` |
| 2   | Medium-high | Public booking, rental and venue forms updated an existing customer's name and email by phone number. Someone who knew a guest's phone and booking reference could redirect that guest's manage-booking code to their own email. | Public forms only add new customers; only the front desk can change an existing customer's details (DECISIONS D-46). `tests/integration/rental-orders.test.ts`                                                                   |
| 3   | Low         | ⌘K search skipped the "finish setting up your account" gate.                                                                                                                                                                     | Search returns nothing until setup is done.                                                                                                                                                                                      |
| 4   | Low         | Two refunds at the same moment could together pay back more than was paid.                                                                                                                                                       | The booking or order row is locked before the refundable amount is worked out.                                                                                                                                                   |
| 5   | Low         | The admin idle sign-out was only enforced in the browser.                                                                                                                                                                        | The server ends sessions idle longer than the setting (5 to 30 minutes) (DECISIONS D-47).                                                                                                                                        |

## V1 Architecture

- Done. Every admin read and write goes through one guard (`requirePermission` / `requirePage` / `act` / `read`), driven by one permission map (`src/server/auth/permissions.ts`). The sidebar, ⌘K palette and screens render from the same map.
- Done. Services (`src/server/services`) import no platform APIs; secrets are read only through `src/server/platform/env.ts`.
- Done. Money, availability and stock rules live in the database as well as in code: an exclusion constraint makes double-booking a room impossible, the audit log is append-only, and a trigger keeps at least one active Super Admin.

## V2 Authentication

- Done. Email and password only; sign-up is closed. Accounts are created by a Super Admin or `scripts/create-super-admin.ts`, with a temporary password that must be changed at first sign-in.
- Done. Passwords: at least 8 characters with letters and a number, at most 72 bytes; bcrypt cost 12 inside Postgres.
- Done. Sign-in, TOTP and reset codes are rate-limited in Postgres per client IP (`cf-connecting-ip`): 5 tries per 30 seconds for sign-in.
- Partly. Two-step sign-in (TOTP plus 10 backup codes) is a setting, off at the owner's request (D-42). Turn it on before live payments.
- Done. Password reset uses a 6-digit email code, hashed, 10 minutes, 5 tries.

## V3 Sessions

- Done. HttpOnly, `SameSite=Lax`, Secure cookies; sessions are stored in Postgres and can be revoked (deactivating a user or resetting their password signs them out everywhere).
- Done. Idle sign-out is enforced on the server (finding 5).
- Done. Guest manage-booking access is an HMAC-signed, expiring, `SameSite=Strict` cookie issued only after a code sent to the phone and email on file.

## V4 Access control

- Done. Staff and Super Admin capabilities are checked on the server for every page, action, export and download. Forbidden pages answer 403.
- Done. Guest links (confirmation pages, invoices, calendar files) use unguessable 18-byte tokens.
- Done. Money and account actions re-ask for the password (finding 1).

## V5 Validation, sanitisation and encoding

- Done. Every action validates input with Zod or explicit checks; prices, deposits, discounts and stock are recomputed on the server.
- Done. No string-built SQL with user input; every `sql.raw` uses constants or server-made dates.
- Done. JSON-LD escapes `<`. CSV cells starting with `= + - @` (and tab or carriage return) are neutralised; Excel cells are XML-escaped inline strings; PDF and calendar text is escaped.

## V7 Errors and logging

- Done. Staff see plain messages; stack traces stay in the Worker logs.
- Done. Every admin change, export and sign-in is recorded (audit log and sign-in history). The audit log cannot be edited or deleted.

## V8 Data protection

- Done. Card and MoMo details never reach our servers (Paystack). Customer lifetime spend is visible only to Super Admins. Payment secret keys are never shown in full, even to Super Admins.
- Done. Housekeeping deletes spent codes, expired sessions and sign-in history older than 180 days.

## V9 Communications and V14 configuration

- Done. HTTPS only, with HSTS (2 years, preload), `X-Content-Type-Options`, `X-Frame-Options: DENY`, a strict Referrer-Policy and a Permissions-Policy.
- Done. Content-Security-Policy (D-45): per-request nonces on the admin, booking, manage and confirmation pages; the cached marketing pages allow inline scripts but keep the rest. No plugins, no framing, forms post only to the site. `tests/e2e/security.spec.ts` loads every public page and fails on any policy violation.
- Done. Dependencies are pinned by the lockfile; Dependabot raises updates.

## V10 Malicious code and V12 files

- Done. Uploads go straight from the browser to Cloudinary with a server signature that fixes the folder; only IDs from those folders are accepted afterwards.
- Done. No server-side file storage, no user-supplied URLs fetched by the server.

## V11 Business logic

- Done. Holds expire after 15 minutes whether or not cron runs; late payments are re-checked and refunded automatically if the room or stock has gone.
- Done. Refunds are capped at what was paid, minus what's already refunded or pending, per payment, under a row lock (finding 4).
- Done. Unpaid pay-at-pickup orders stop holding stock at 10:00 on pickup day.

## V13 API

- Done. Paystack webhook: HMAC-SHA512, constant-time compare, stored once per event, then re-verified with Paystack (amount and currency) before anything is confirmed.
- Done. The cron route is reachable only from inside the Worker with a key derived from the auth secret; anything else gets 404.

## Before going live with real money

1. Turn on Settings › Security › "Require two-step sign-in" and enrol every Super Admin.
2. Replace the Paystack test keys with live keys on the production Worker only.
3. Rotate every secret that was ever pasted into a chat or email (see RUNBOOK › Rotate a secret).
