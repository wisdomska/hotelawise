# Hotel A-Wise

The website, booking engine and admin CMS for Hotel A-Wise, No. 1 Wisepak Lane, New Asofan, Accra.

- **Guests** book rooms and pay by Mobile Money or card, manage their booking, reserve event rentals for pickup, and send venue enquiries.
- **Staff** run the hotel from `/admin`. Super Admins can see and change everything; Staff see only what their role allows.

| Area       | Choice                                                                      |
| ---------- | --------------------------------------------------------------------------- |
| App        | Next.js 16 (App Router, Server Actions), TypeScript                         |
| Hosting    | Cloudflare Workers via OpenNext (`wrangler.jsonc`: `production`, `preview`) |
| Database   | Neon Postgres with Drizzle (`drizzle/` migrations)                          |
| Admin auth | Better Auth, with TOTP two-factor sign-in                                   |
| Payments   | Paystack (MoMo and card, GHS)                                               |
| Images     | Cloudinary                                                                  |
| Email      | Resend                                                                      |

Plans and decisions are in `docs/`:

- [PLAN](docs/PLAN.md)
- [DECISIONS](docs/DECISIONS.md)
- [ARCHITECTURE](docs/ARCHITECTURE.md)

The visual reference is `design/`. That folder holds the prototypes, plus `reference-screens/` captured at 1440 and 390 px wide.

## Local development

Requires Node 22, pnpm 10 and a Postgres 16 server (local, or a Neon branch).

```bash
pnpm install
cp .env.example .env.local          # fill in DATABASE_URL, BETTER_AUTH_SECRET, REF_SECRET
pnpm db:migrate
pnpm db:seed                        # real catalogue only; no demo data
SUPER_ADMIN_EMAIL=you@example.com SUPER_ADMIN_TEMP_PASSWORD=change-me-1 pnpm admin:create
pnpm dev                            # http://localhost:3000, admin at /admin
```

When you first sign in to the admin, you must set a new password. Super Admins must also turn on two-step sign-in with an authenticator app.

### Commands

| Command                                        | What it does                                                                                                      |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm format` / `pnpm typecheck` | Static checks (CI runs all three)                                                                                 |
| `pnpm test:unit` / `pnpm test:coverage`        | Unit tests / the whole suite with the 90% coverage gate on `src/lib` and `src/server/services` (needs Postgres)   |
| `pnpm test:integration`                        | Database tests. They need Postgres at `TEST_DATABASE_URL` (default `postgres://postgres@localhost:5433/postgres`) |
| `pnpm build && pnpm test:e2e`                  | Playwright end-to-end tests against a production build                                                            |
| `pnpm cf:build` / `pnpm cf:preview`            | Build the Cloudflare Worker, or build and run it locally                                                          |
| `pnpm cf:deploy:preview`                       | Deploy the preview Worker by hand. Builds with `.env.local` set aside, because OpenNext bundles `.env*` values    |
| `pnpm db:generate` / `pnpm db:migrate`         | Create migrations from `src/server/db/schema.ts`, or apply them                                                   |
| `pnpm images:import`                           | Upload the hotel photos to Cloudinary under their corrected names                                                 |
| `pnpm design:capture`                          | Re-capture the prototype reference screenshots                                                                    |

## Branches and releases

| Branch                       | Purpose                    | Deploys to                    |
| ---------------------------- | -------------------------- | ----------------------------- |
| `main`                       | Production                 | `hotelawise.com`              |
| `preview`                    | Staging, behind a password | `preview.hotelawise.com`      |
| `feat/*`, `fix/*`, `chore/*` | Feature work               | A pull request into `preview` |

- A release is a pull request from `preview` into `main`.
- Commits follow Conventional Commits. The `commit-msg` hook rejects tool attribution lines.
- CI checks that every commit is authored by WISDOMSKA(SENYA).

## Confirm with the hotel

These are seed values, not facts from the hotel. Each one can be edited in the admin; please confirm them before launch.

**Rooms**

- Room numbers: Standard 101–106, Double 107–108, Executive 201/202/205, Executive Plus 203/204, VIP 206–208 (16 rooms).

**Times, fees and policies**

- Check-in 14:00, check-out 12:00. Breakfast GHS 50 per guest per day. Room service GHS 20.
- Free cancellation up to 48 hours before check-in. The deposit is 30%. A no-show is charged the first night.
- Ghana levies (VAT 15%, NHIL 2.5%, GETFund 2.5%, Tourism 1%) are treated as already included in prices.

**Contact numbers**

- Reception +233 55 555 7090 (from the spec).
- Other numbers +233 54 012 0400 and +233 55 555 7033. The old website listed +233 54 012 0400 as the main number.

**Rentals**

- Daily prices (GHS): canopy 250, long table 40, short table 25, foldable chair 5, regular chair 3, tablecloth 15, chair cover 4.
- Refundable deposit per unit (GHS): canopy 100, long table 20, short table 15, foldable chair 2, regular chair 1, tablecloth 5, chair cover 1.
- Stock: 12 canopies, 30 long tables, 40 short tables, 300 foldable chairs, 400 regular chairs, 60 tablecloths, 200 chair covers.
- Packs: Wedding pack 10% off, Funeral pack 10% off, Party pack 8% off.

**Venues**

- Hire, as a starting point for quotes: compound GHS 2,500, conference room GHS 800. Setup GHS 150, offered only for venue bookings.

**Offers (seeded paused)**

- Christmas & New Year +15%; Weekend nights on the Double +GHS 30; Long stay (7+ nights) −10%; Independence Day +10%.
- Promo codes AWISE3 (free breakfast on 3+ nights) and NIGHTOWL (GHS 20 off).
- The site banner "Book 3 nights, get breakfast on us" is off until the AWISE3 offer is confirmed.

**Photos**

- The regular plastic chair has no photo yet.
- The Summer Hut concept image shows a pool A-Wise doesn't have. Replace it before launch; the admin flags it.

## License

Proprietary. © WISDOMSKA(SENYA). All rights reserved.
