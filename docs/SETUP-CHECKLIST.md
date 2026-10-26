# Setup checklist (owner steps)

These are the steps only the owner can do. Everything else (creating Cloudflare resources, databases, DNS records, secrets, deploys) can be done from the development environment once the keys below exist.

Every service listed here has a free plan that needs no card.

## 0. Security first

- [ ] **Revoke** the GitHub token and the Cloudflare token that were pasted into the chat earlier. Treat them as exposed.
  - GitHub: Settings → Developer settings → Personal access tokens.
  - Cloudflare: My Profile → API Tokens.

## 1. Decide on the domain

`hotelawise.com` is **not registered** (checked on 26 Oct 2026; the .com registry has no record of it). So it can't host the site, and `info@hotelawise.com` can't receive mail today.

Choose one:

- [ ] **A. Register a domain.** About $10–12 a year, which is the only cost on this list. Cloudflare Registrar sells at cost: Cloudflare dashboard → Domain Registration → Register Domains. Registering through Cloudflare means there are no nameservers to change. Needed for:
  - the real address (`hotelawise.com`, `preview.hotelawise.com`)
  - sending booking emails from the hotel's own domain
  - a working `info@` mailbox, which needs a mail host such as Zoho Mail's free plan
- [ ] **B. Stay free for now.** The site runs at a free Cloudflare address such as `hotel-a-wise.<your-subdomain>.workers.dev`, with the preview on its own `workers.dev` address. You can add a domain later without changing code.
  - Guest emails can't be sent from a domain you don't own. Until there is one, confirmations show on screen, the guest can download the calendar file, and staff get alerts at an inbox you choose.

## 2. Create free accounts and keys

Add each key in **this cloud environment's settings**: the environment menu in the session title bar → Edit → Network secrets or Environment variables. Use exactly the variable names below.

**Never paste keys into the chat.** New keys reach the next session, so after adding them, start a new session and say "continue".

| #   | Service                                               | What to do                                                                                                                                                                                                                                                                                                                                                        | Variable name(s)                                                       |
| --- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 1   | **Cloudflare**                                        | Dashboard → My Profile → API Tokens → Create Token → Custom token. **Account** permissions: Workers Scripts Edit, Workers KV Storage Edit, D1 Edit, Turnstile Edit, Account Settings Read. If you registered a domain, also add **Zone** permissions DNS Edit and Workers Routes Edit for that zone. Copy the Account ID from the dashboard's right-hand sidebar. | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`                        |
| 2   | **Neon** (Postgres)                                   | Sign up at neon.tech → Account settings → API keys → Create. I create the project (region Frankfurt) and its `main`, `preview` and `ci` branches.                                                                                                                                                                                                                 | `NEON_API_KEY`                                                         |
| 3   | **Cloudinary** (photos)                               | Sign up at cloudinary.com → Settings → API Keys.                                                                                                                                                                                                                                                                                                                  | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` |
| 4   | **Upstash** (rate limits)                             | Sign up at upstash.com → Create Database (Redis, region eu-west, free) → REST API section.                                                                                                                                                                                                                                                                        | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                   |
| 5   | **Sentry** (error tracking)                           | Sign up at sentry.io → create a project (platform: Next.js, name `hotel-a-wise`) → copy the DSN.                                                                                                                                                                                                                                                                  | `SENTRY_DSN`                                                           |
| 6   | **Paystack** (payments, **test mode**)                | Sign up at paystack.com → Settings → API Keys & Webhooks → **test** keys only. Live keys come later, after Paystack verifies the business.                                                                                                                                                                                                                        | `PAYSTACK_TEST_SECRET_KEY`, `PAYSTACK_TEST_PUBLIC_KEY`                 |
| 7   | **Resend** (email). Only if you chose domain option A | Sign up at resend.com → API Keys → Create. I add the domain and its DNS records.                                                                                                                                                                                                                                                                                  | `RESEND_API_KEY`                                                       |
| 8   | **Admin inbox**                                       | The email address that should receive new-booking, order and enquiry alerts, and own the first Super Admin account.                                                                                                                                                                                                                                               | `SUPER_ADMIN_EMAIL`                                                    |

## 3. GitHub settings (needs repository admin rights)

1. **Branch protection.** Repo → Settings → Branches → Add rule, once for `main` and once for `preview`:
   - Require a pull request
   - Require status checks: "Lint, format, typecheck, unit tests", "Integration tests (Postgres)", "Worker build and size", "E2E (Playwright)", "analyze"
   - Require linear history
   - Do not allow force pushes

   Alternatively, run `bash scripts/github/protect-branches.sh` on your computer after `gh auth login`.

2. **Deploy secrets.** Repo → Settings → Environments → create `preview` and `production`. In each, add:
   - `CLOUDFLARE_API_TOKEN`
   - `CLOUDFLARE_ACCOUNT_ID`
   - `DATABASE_URL_MIGRATE`. I'll give you each environment's value once the Neon branches exist.

   Until these are set, the Deploy workflow stops with a clear "secret not set" message. That is expected.

## Done by me (no action needed)

**Already done**

- `preview` branch created. Milestone 1 pull request opened (wisdomska/hotelawise#1) and watched for CI failures.
- Everything runs on free plans (DECISIONS D-28 to D-31):
  - password hashing runs in Postgres
  - the page cache uses KV instead of R2
  - the preview site has a password gate instead of Cloudflare Access

**Once the keys arrive**

- Create the Cloudflare KV namespaces, D1 databases, Turnstile widgets, Workers and Worker secrets.
- Create the Neon project and its branches, migrate and seed.
- Create the first Super Admin. You'll get a temporary password on screen and set your own at first sign-in.
- Upload the photos to Cloudinary.
- Deploy the preview and production Workers.
- If you registered a domain: add the custom domains and the Resend SPF/DKIM/DMARC records.
