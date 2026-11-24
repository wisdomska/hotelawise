# Hotel A-Wise

Website, booking engine and admin for **Hotel A-Wise**, No. 1 Wisepak Lane, New Asofan, Accra.

- **Guests** book a room, reserve event rentals to collect, and enquire about hiring the event compound or conference room. Paying online by Mobile Money or card, and managing a booking with a texted code, switch on once the hotel's payment and messaging keys are added (see below).
- **Staff** run the hotel from `/admin`: bookings, rooms, rentals, inventory, venues, payments, customers, content, reports and users, in a light or a night-navy dark theme. Every change is written to an audit log.

**Live:** https://hotelawise.wisdomska.workers.dev (moves to `hotelawise.com` once the domain is connected). **Preview:** https://hotelawise-preview.wisdomska.workers.dev (not indexed). **Latest release:** [v1.0.0](https://github.com/wisdomska/hotelawise/releases/tag/v1.0.0), notes in [CHANGELOG.md](CHANGELOG.md); changes merged since then are listed under Unreleased.

## Status

| Milestone                                              | State                           |
| ------------------------------------------------------ | ------------------------------- |
| M1 Foundations: schema, auth, CI/CD, Worker build      | Done                            |
| M2 Public site: home, rooms, gallery, contact          | Done                            |
| M3 Room booking: holds, Paystack, confirmation, manage | Done                            |
| M4 Rentals (reserve and collect) and venue enquiries   | Done                            |
| M5 Admin: 14 screens, roles and permissions, audit     | Done                            |
| M6 Notifications, scheduled jobs, reports, exports     | Done                            |
| M7 Release: QA report, security pass, runbook, v1.0.0  | Done: v1.0.0 live in production |

### In production today

**Works now**

- The public site: home, rooms, gallery, contact, and rentals & venues.
- Room bookings paid at the hotel, with a 15-minute hold. The database refuses overlapping bookings of the same room, so a room can't be double-booked, even by two guests clicking at once.
- Rental reservations paid at pickup, with stock locked and re-counted when each order is placed.
- Venue enquiries, contact messages and newsletter sign-ups, with an invisible bot check, all landing in the admin inbox.
- The admin: desk bookings and payments, content and photos (changes show on the site for the next visitor), reports, exports and the audit log.
- Photo uploads (Cloudinary) and the scheduled job (02:00, 07:00 and 10:00).

The site shows when a room is sold out or a rental item is all booked, but never how many are left (D-55).

**Waiting on the hotel's accounts**

| Needed                                | What it switches on                                                                                                  |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Paystack live keys                    | Online Mobile Money and card payments. Until then guests pay at the hotel or at pickup                               |
| Resend (email) and Arkesel (SMS) keys | Confirmations, reminders and the manage-my-booking sign-in code. Until then guests call the desk to change or cancel |
| The `hotelawise.com` domain           | The site's own address, in place of `hotelawise.wisdomska.workers.dev`                                               |

The plan is in [docs/PLAN.md](docs/PLAN.md). The release QA is in [docs/QA-REPORT.md](docs/QA-REPORT.md) and the security review in [docs/SECURITY.md](docs/SECURITY.md). Hotel facts that still need the owner's confirmation are in [docs/HOTEL-FACTS.md](docs/HOTEL-FACTS.md).

### Public pages

| Path       | What's there                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `/`        | Hero with the booking bar, rooms, facilities, rentals, events, a guest review and getting here |
| `/rooms`   | Rooms with filters and a side-by-side comparison; `/rooms/[code]` for each room                |
| `/book`    | Three-step room booking: dates and room, your details, pay                                     |
| `/manage`  | Look up a booking by reference and phone, then change dates or cancel                          |
| `/rent`    | Rentals & venues: reserve items to collect, and enquire about the venues at `/rent#venues`     |
| `/gallery` | Photos, filtered by category                                                                   |
| `/contact` | Reception, WhatsApp, email, address and hours, a message form and the FAQ                      |

`/venues` redirects to `/rent#venues` (see D-53 in [docs/DECISIONS.md](docs/DECISIONS.md)). Phone numbers print as one unbroken run, such as `+233555557090` (D-54).

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
| Bot checks | Cloudflare Turnstile (invisible: no checkbox on any page)              |
| Tests      | Vitest (unit and integration), Playwright with axe (e2e, a11y, visual) |

## Accessibility

The site and the admin aim for **WCAG 2.2 AA**, and the tests hold them to it:

- axe (WCAG 2.0–2.2 A and AA rules) on every public page, every admin screen and tab in both themes, and the open dialogs, drawers, lightbox and search.
- Keyboard: a skip link on every page; dialogs move focus in, keep Tab inside and hand focus back when they close; every control shows a focus ring.
- Reflow at 320 px wide and the user's own text spacing (WCAG 1.4.10, 1.4.12) without sideways scrolling.
- Contrast: text at 4.5:1 or more and field outlines at 3:1 in both admin themes. Motion respects "reduce motion".

The tests are `tests/e2e/a11y.spec.ts` and `tests/e2e/admin-a11y.spec.ts`; results are in the [QA report](docs/QA-REPORT.md).

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
| `pnpm cf:deploy:production`          | Deploy the production Worker by hand (normally the Deploy workflow does it)                        |
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

| Branch    | Environment | Address                                                          |
| --------- | ----------- | ---------------------------------------------------------------- |
| `main`    | production  | `hotelawise.wisdomska.workers.dev`, then `hotelawise.com`        |
| `preview` | preview     | `hotelawise-preview.wisdomska.workers.dev`, open but not indexed |

A push to `preview` or `main` migrates that environment's database and then deploys its Worker (`.github/workflows/deploy.yml`). Its secrets are repository-level Actions secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `DATABASE_URL_MIGRATE_PRODUCTION` and `DATABASE_URL_MIGRATE_PREVIEW`. Every pull request into `preview` also uploads a preview version and links it in the PR. Deploys, rollbacks and incident steps are in [docs/RUNBOOK.md](docs/RUNBOOK.md).

The Worker has to stay under the free plan's 3 MiB (gzip). CI measures it on every pull request.

Each Worker has one Cron Trigger, at 02:00, 07:00 and 10:00 Accra (the free plan allows 5 per account). Each run tidies lapsed holds and unpaid pay-at-pickup orders; the 07:00 run also sends reminders and the 02:00 run does housekeeping. It runs only three times a day so the Neon database can sleep in between and stay inside its free monthly compute (D-59).

### Releases

Raise `version` in `package.json` and add its section to [CHANGELOG.md](CHANGELOG.md) in the same pull request. When it reaches `main`, the Release workflow (`.github/workflows/release.yml`) tags the commit and publishes a GitHub release with that section as its notes. It can also be run by hand from the Actions tab.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) for branches, commit style and the checks a pull request must pass. To report a security problem, see [SECURITY.md](SECURITY.md).

## License

Proprietary. © 2026 WISDOMSKA(SENYA). All rights reserved. See [LICENSE](LICENSE).
