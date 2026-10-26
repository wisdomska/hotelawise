# Architecture

How the system is built. For what is being built and why, see [PLAN.md](./PLAN.md) and [DECISIONS.md](./DECISIONS.md).

## Runtime

```
Browser ──► Cloudflare Worker (OpenNext: Next.js 16 App Router)
              ├─ static assets (Workers Assets)
              ├─ ISR cache: KV · tags: D1 · revalidation queue: Durable Object
              ├─ Neon Postgres: HTTP driver for reads, WebSocket Pool for transactions
              ├─ Paystack · Resend · Cloudinary · Turnstile · Sentry
              └─ scheduled(): Cron Triggers (*/15, daily 07:00, daily 02:00 Accra)
```

- **Entry point.** `src/worker/index.ts` wraps the generated OpenNext worker and adds `scheduled()`.
- **Cron jobs.** They only tidy up and send notifications. Correctness never depends on them (see _Holds_).
- **Configuration.** `src/server/platform/env.ts` reads and validates vars and secrets from `process.env`.
- **Database handles.** `src/server/platform/db.ts` provides them:
  - `db()` is a request-cached Neon HTTP client.
  - `withTransactionDb()` opens a Pool for one transactional call and closes it.
  - Local development can set `DATABASE_DRIVER=pg`. Worker builds alias that module to a stub, so node-postgres never ships to Cloudflare.
- **Portability.** `src/server/services/*` is platform-neutral (Drizzle plus plain TypeScript). Only `src/server/platform/*` and `src/worker/*` know about Cloudflare.

## Code map

| Path                   | Contents                                                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------------------------- |
| `src/lib/`             | Pure helpers: money in pesewas, dates in Africa/Accra, Ghana E.164 phones, unguessable references        |
| `src/server/db/`       | Drizzle schema, Neon and node-postgres clients                                                           |
| `drizzle/`             | `0000_init.sql` (generated) and `0001_constraints.sql`: the exclusion constraint, sequences and triggers |
| `src/server/services/` | Pricing, availability, holds, rentals, references, audit, jobs                                           |
| `src/server/auth/`     | Permission matrix, Better Auth config, password hashing, actor guard, user creation                      |
| `src/server/content/`  | Image manifest (renames, alt text, slots), default copy and settings                                     |
| `src/app/(site)/`      | Public site. Ported screen by screen from `design/Website.dc.html` and `design/Checkout.dc.html`         |
| `src/app/admin/`       | Admin CMS. Ported from `design/Admin.dc.html`                                                            |

## Data model

The ERD is in [PLAN.md §3](./PLAN.md#3-data-model-erd), and the source of truth is `src/server/db/schema.ts`. Rules the database enforces itself:

| Rule                                                               | Where                                                                                            |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| No two active allocations of a room overlap                        | `room_allocations_no_overlap` `EXCLUDE USING gist (room_id WITH =, stay WITH &&) WHERE (active)` |
| There is always an active Super Admin                              | trigger `user_keep_one_super_admin`                                                              |
| Audit log is append-only                                           | trigger `audit_log_no_change`                                                                    |
| A published gallery photo has alt text                             | `gallery_alt_ck`                                                                                 |
| A payment belongs to exactly one booking, order or enquiry         | `payments_one_target_ck`                                                                         |
| Stock and money are never negative                                 | `*_ck` checks                                                                                    |
| Rentals are pickup unless a delivery zone is set (delivery is off) | `rental_orders_pickup_only_ck`                                                                   |

All money is stored as integer pesewas. A stay is a `[check_in, check_out)` range of `date`s. Timestamps are `timestamptz`.

## Key flows

### Holds (`services/holds.ts`)

Leaving step 1 of `/book` creates a booking in status `held`, plus a `room_allocations` row with `hold_expires_at = now + 15 min`. Because a hold is an allocation, the exclusion constraint covers it.

1. The allocating transaction first deactivates any lapsed holds that overlap the requested range.
2. It then tries the free rooms of the rate variant in room-number order.
3. If an insert hits the exclusion constraint (`23P01`), it moves on to the next room.

The result: 20 parallel buyers for the last room produce exactly one hold (`tests/integration/holds.test.ts`).

### Rental orders (`services/rentals.ts`)

One transaction does the following:

1. Lock the item rows (`SELECT … FOR UPDATE`, in id order).
2. Sum the units committed by orders that still hold stock, for every day from the start date to the day after the end date (the extra day is for returns).
3. Check the requested quantities against that.
4. Insert the order, its lines and a status event.

Unpaid pay-at-pickup orders stop holding stock at 10:00 Accra time on pickup day. Racing 20 buyers for the last 100 chairs, in groups of 10, yields exactly 10 orders.

### Pricing (`services/pricing.ts`)

`stayPrice()` is one function, used everywhere. For each night it takes the base rate and adds every active rule that hits that night. Rule deltas are computed on the base rate, so they don't compound, and a night never goes below zero. The semantics match the prototype's `AWStore.stayPrice`. The server always recomputes totals.

### References (`lib/refs.ts`)

`nextval()` on a per-kind sequence is fed through a keyed Feistel permutation (key `REF_SECRET`). The result is encoded in a 32-character alphabet without 0, O, 1 or I. References are unique by construction, and consecutive bookings don't get consecutive references.

## Admin security

**Sign-in**

- Better Auth handles email and password, TOTP two-factor and emailed 6-digit reset codes (10-minute expiry).
- Sign-up is disabled; staff are invited.
- Passwords use bcrypt at cost 12, computed in Postgres with `pgcrypto`, so the hash costs the Worker almost no CPU (`auth/password.ts`, D-28).

**Session**

- A 30-minute sliding idle timeout, in an `aw.session_token` cookie (HttpOnly, SameSite=Lax, Secure on HTTPS).
- Sign-in locks for 30 s after 5 tries (Handoff). TOTP checks and reset codes are rate-limited too.

**Account setup**

Before anything else opens:

- A user with a temporary password must set their own.
- A Super Admin must turn on TOTP.

**Authorisation**

- One permission map (`auth/permissions.ts`) drives the sidebar, the palette and the server.
- `requirePage()` handles pages: it redirects to sign-in or setup, and calls `forbidden()` (403) when the role lacks the capability.
- `authorize()` / `requirePermission()` handle actions.
- Money actions call `confirmPassword()`.
- Every mutation writes to `audit_log`.

## Testing

| Layer       | Tool                                              | Runs against                                                                               |
| ----------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Unit        | Vitest                                            | Pure modules. Coverage gate is 90% (currently 100% lines)                                  |
| Integration | Vitest                                            | A fresh Postgres database per test file: locally, or a Postgres 16 service container in CI |
| E2E         | Playwright (Chromium, WebKit, Pixel 7, iPhone 14) | A production build with a seeded Postgres, in CI                                           |

CI uses a throwaway Postgres container, not a Neon branch. It is free, needs no account, and test users never exist on a deployed database (D-04). Deployed previews get a smoke test once the Cloudflare and Neon accounts are connected.

## Measurements (milestone 1)

| What                                                   | Result                                               | Limit (Workers Free) |
| ------------------------------------------------------ | ---------------------------------------------------- | -------------------- |
| Worker bundle, compressed                              | 2,232 KiB (shell, auth, schema, preview gate)        | 3,072 KiB            |
| Password check on the Worker, CPU                      | ~1.4 ms (bcrypt runs in Postgres; ~250 ms wall time) | 10 ms per request    |
| Password check with scrypt on the Worker (before D-28) | ~96 ms                                               | 10 ms per request    |

Everything fits Workers Free. CPU per route is re-measured on the deployed preview Worker and recorded in `QA-REPORT.md`.

## Preview protection

`src/proxy.ts` asks for a password (`PREVIEW_PASSWORD`, Basic auth) on every preview request except the Paystack webhook and `/api/health`, and adds `noindex` on every non-production response (D-30).
