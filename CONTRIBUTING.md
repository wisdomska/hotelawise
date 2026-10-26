# Contributing

This is a private codebase. These rules keep it shippable at any moment.

## Branches

- `main` is production and `preview` is staging. Never push to either directly.
- Work on `feat/*`, `fix/*` or `chore/*` and open a pull request into `preview`.
- A release is a pull request from `preview` into `main`.

## Commits

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(booking): …`, `fix(rentals): …`, `test: …`. Keep the subject under 72 characters and the body lines under 100.
- Every commit is authored by **WISDOMSKA(SENYA)** <102672450+wisdomska@users.noreply.github.com>. CI rejects any other author.
- No co-author or tool attribution lines. The `commit-msg` hook rejects them.

## Before you open a pull request

Run what CI runs:

```bash
pnpm lint && pnpm format && pnpm typecheck
pnpm test:coverage                 # needs Postgres; 90% gate on src/lib and src/server/services
pnpm build && pnpm test:e2e        # Playwright, including axe and visual checks
pnpm cf:build && node scripts/check-worker-size.mjs   # Worker must stay under 3 MiB gzip
```

The pull request template asks what changed, why, and how it was tested. Fill it in.

## Rules that matter here

- **The design is the spec.** Pages must match the prototypes in `design/`. If the prototype and the handoff notes disagree, the prototype wins (DECISIONS D-00). Compare your screen with `design/reference-screens/` at 1440 and 390 px.
- **The server decides money and availability.** Prices, discounts, deposits and stock are recomputed on the server from the database. Never trust an amount sent by the browser.
- **Payments are confirmed only by Paystack.** A booking or order is paid when Paystack verifies the transaction, through the webhook or an on-demand check. Never because a page said so.
- **No demo content** on any deployed site, preview included. Seeds load only the real catalogue.
- **Schema changes go through migrations.** Edit `src/server/db/schema.ts`, run `pnpm db:generate`, and commit the SQL in `drizzle/`. Deploys apply migrations before the new code goes live.
- **Staff actions are audited.** Anything that changes a booking, order, payment, price, permission or setting writes an audit entry.
- **Accessibility is tested.** New pages and overlays need an axe check in `tests/e2e/a11y.spec.ts` with no violations.
- **Record decisions.** When you choose between reasonable options, add a short entry to `docs/DECISIONS.md`.

## Secrets

Never commit secrets or paste them into issues, pull requests or chat. `.env.local` and `.dev.vars` are git-ignored. Deployed secrets are set with `wrangler secret put` and kept in GitHub environment secrets. See [SECURITY.md](SECURITY.md).
