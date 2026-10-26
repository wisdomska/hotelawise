# Hotel A-Wise

Website, booking engine and admin for **Hotel A-Wise**, No. 1 Wisepak Lane, New Asofan, Accra.

- **Guests** book a room and pay by Mobile Money or card, manage the booking with a texted code, reserve event rentals to collect, and send venue enquiries.
- **Staff** run the hotel from `/admin`: bookings, rooms, rentals, inventory, venues, payments, customers, content, reports and users. Every change is written to an audit log.

## Status

| Milestone                                              | State                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| M1 Foundations: schema, auth, CI/CD, Worker build      | Done                                                                   |
| M2 Public site: home, rooms, gallery, contact          | Done                                                                   |
| M3 Room booking: holds, Paystack, confirmation, manage | Done                                                                   |
| M4 Rentals (reserve and collect) and venue enquiries   | Done                                                                   |
| M5 Admin: 14 screens, roles and permissions, audit     | Done                                                                   |
| M6 Notifications, scheduled jobs, reports, exports     | Done                                                                   |
| M7 Release: QA report, security pass, runbook, v1.0.0  | Done on preview; production launch waiting on the steps in the runbook |

The plan is in [docs/PLAN.md](docs/PLAN.md). The release QA is in [docs/QA-REPORT.md](docs/QA-REPORT.md) and the security review in [docs/SECURITY.md](docs/SECURITY.md). Hotel facts that still need the owner's confirmation are in [docs/HOTEL-FACTS.md](docs/HOTEL-FACTS.md).

## Stack

| Area       | Choice                                                                 |
| ---------- | ---------------------------------------------------------------------- |
| App        | Next.js 16 (App Router, Server Actions), React 19, TypeScript          |
| Hosting    | Cloudflare Workers (free plan) through OpenNext                        |
| Database   | Postgres 16 (Neon in deployed environments) with Drizzle ORM           |
| Admin auth | Better Auth: email and password, optional TOTP two-step (a setting)    |
| Payments   | Paystack: MoMo (MTN, Telecel, AirtelTigo) and card, in GHS             |
| Messages   | Resend (email), Arkesel (SMS, optional)                                |
| Images     | Cloudinary                                                             |
| Bot checks | Cloudflare Turnstile                                                   |
| Tests      | Vitest (unit and integration), Playwright with axe (e2e, a11y, visual) |

How the parts fit together: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Why things are the way they are: [docs/DECISIONS.md](docs/DECISIONS.md).

## Getting started

You need Node 22 (see `.nvmrc`), pnpm 10 and a Postgres 16 server, either local or a Neon branch.

```bash
pnpm install
cp .env.example .env.local     # set DATABASE_URL, BETTER_AUTH_SECRET and REF_SECRET at least
pnpm db:migrate
pnpm db:seed                   # the real catalogue; no demo data
SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_TEMP_PASSWORD='choose-a-temp-one' pnpm admin:create
pnpm dev                       # http://localhost:3000, admin at /admin
```

On first sign-in you must set a new password. When Settings › Security › "Require two-step sign-in" is on, Super Admins also set up an authenticator app.

Services you haven't configured stay off and the site says so plainly. Without Paystack keys, guests are offered pay-at-hotel or a phone number. Without Resend, emails print to the console in development.

### Environment variables

Every variable is listed with a comment in [`.env.example`](.env.example). The main ones:

| Variable                                                   | Needed for                                          |
| ---------------------------------------------------------- | --------------------------------------------------- |
| `DATABASE_URL` (+ `DATABASE_DRIVER=pg` for local Postgres) | Everything that reads or writes data                |
| `BETTER_AUTH_SECRET`, `REF_SECRET`                         | Admin sessions; booking references and guest codes  |
| `PAYSTACK_SECRET_KEY`, `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY`   | Online payments (test keys anywhere but production) |
| `RESEND_API_KEY`, `EMAIL_FROM`                             | Confirmation and staff emails                       |
| `CLOUDINARY_*`                                             | Photo uploads from the admin                        |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`   | Bot checks on holds, orders and forms               |
| `SMS_PROVIDER`, `SMS_API_KEY`, `SMS_SENDER_ID`             | Texted receipts and manage-booking codes            |

Deployed Workers get public values from `wrangler.jsonc` and secrets from `wrangler secret put`. Never commit a real value.

## Commands

| Command                              | What it does                                                                                       |
| ------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `pnpm dev`                           | Local development server                                                                           |
| `pnpm lint` · `format` · `typecheck` | Static checks (CI runs all three)                                                                  |
| `pnpm test:unit`                     | Unit tests                                                                                         |
| `pnpm test:integration`              | Database tests against `TEST_DATABASE_URL` (default `postgres://postgres@localhost:5433/postgres`) |
| `pnpm test:coverage`                 | Whole Vitest suite with the 90% coverage gate on `src/lib` and `src/server/services`               |
| `pnpm build && pnpm test:e2e`        | Playwright against a production build (Chromium, WebKit, Pixel 7, iPhone 14)                       |
| `pnpm db:generate` · `db:migrate`    | Create a migration from `src/server/db/schema.ts` · apply migrations                               |
| `pnpm db:seed`                       | Load the catalogue (rooms, rentals, venues, FAQs, paused offers)                                   |
| `pnpm admin:create`                  | Create the first Super Admin                                                                       |
| `pnpm cf:build` · `cf:preview`       | Build the Cloudflare Worker · build and run it locally                                             |
| `pnpm cf:deploy:preview`             | Deploy the preview Worker by hand (sets `.env.local` aside so it isn't bundled)                    |
| `pnpm images:import`                 | Upload the hotel photos to Cloudinary                                                              |
| `pnpm design:capture`                | Re-capture the prototype reference screenshots                                                     |

## Project layout

```
src/
  app/            routes: (site) public pages, (site)/(checkout) booking and rentals, admin, api
  components/     site, checkout, admin, ui and motion components
  server/
    services/     business rules: bookings, holds, pricing, rentals, payments, notifications
    integrations/ Paystack, Resend, SMS and Turnstile clients
    db/           Drizzle schema and clients
    auth/         Better Auth setup, roles and permissions
    platform/     env, database access, rate limits, preview gate
  lib/            pure helpers shared by browser and server (dates, money, forms, .ics)
  worker/         Worker entry: scheduled jobs
drizzle/          SQL migrations
design/           Prototypes and reference screens (the visual source of truth)
tests/            unit, integration and e2e (incl. a11y and visual)
scripts/          migrations, seed, admin setup, build helpers
docs/             plan, architecture, decisions, setup checklist, runbook, hotel facts
```

## Environments and deploys

| Branch    | Environment | Address                                                            |
| --------- | ----------- | ------------------------------------------------------------------ |
| `main`    | production  | `hotel-a-wise.wisdomska.workers.dev`, then `hotelawise.com`        |
| `preview` | preview     | `hotel-a-wise-preview.wisdomska.workers.dev`, open but not indexed |

A push to `preview` or `main` migrates that environment's database and then deploys its Worker (`.github/workflows/deploy.yml`). Every pull request into `preview` also uploads a preview version and links it in the PR. Deploys, rollbacks and incident steps are in [docs/RUNBOOK.md](docs/RUNBOOK.md).

The Worker has to stay under the free plan's 3 MiB (gzip). CI measures it on every pull request.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commit style and the checks a pull request must pass. To report a security problem, see [SECURITY.md](SECURITY.md).

## License

Proprietary. © 2026 WISDOMSKA(SENYA). All rights reserved. See [LICENSE](LICENSE).
