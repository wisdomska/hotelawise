# Setup checklist (owner steps)

These are the steps only the owner can do. Everything else (creating Cloudflare resources, databases, DNS records, secrets, deploys) can be done from the development environment once the keys below exist.

Every service listed here has a free plan that needs no card.

## 0. Security first

- [ ] **Revoke** the GitHub token and the Cloudflare token that were pasted into the chat earlier. Treat them as exposed.
  - GitHub: Settings → Developer settings → Personal access tokens.
  - Cloudflare: My Profile → API Tokens.

## 1. Decide on the domain

**Decided (26 Oct 2026): option B for now.** Production runs at `hotel-a-wise.wisdomska.workers.dev` and the preview at `hotel-a-wise-preview.wisdomska.workers.dev`. A domain can be added later without code changes.

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

| #   | Service                                                                                       | What to do                                                                                                                                                                                                                                                                                                                                                                     | Variable name(s)                                           |
| --- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| 1   | **Cloudflare**                                                                                | Dashboard → My Profile → API Tokens → Create Token → Custom token. **Account** permissions: Workers Scripts Edit, Workers KV Storage Edit, D1 Edit, Turnstile Edit, Account Settings Read. If you registered a domain, also add **Zone** permissions DNS Edit and Workers Routes Edit for that zone. Copy the Account ID from the dashboard's right-hand sidebar.              | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`            |
| 2   | **Neon** (Postgres)                                                                           | Your Neon account is a **Vercel-managed** team, which doesn't allow creating projects from the API. Either sign up at neon.tech with an email that isn't linked to Vercel and create an API key there, or create the database yourself (Vercel → Storage → Create → Neon, name `hotelawise`, region London or Frankfurt) and send me its pooled and direct connection strings. | `NEON_API_KEY`, or `DATABASE_URL` + `DATABASE_URL_MIGRATE` |
| 3   | **Cloudinary** (photos)                                                                       | ✅ Done. Photos uploaded; the preview serves them from Cloudinary.                                                                                                                                                                                                                                                                                                             | —                                                          |
| 4   | **Sentry** (error tracking, optional)                                                         | Sign up at sentry.io (free Developer plan) → create a project: platform **Next.js**, name `hotel-a-wise`, default alerts. Skip the setup wizard; copy the DSN from Project Settings → Client Keys (DSN).                                                                                                                                                                       | `SENTRY_DSN`                                               |
| 5   | **Paystack** (payments, **test mode**)                                                        | ✅ Done. Test keys are set on the preview Worker. Live keys come later, after Paystack verifies the business.                                                                                                                                                                                                                                                                  | —                                                          |
| 6   | **Resend** (email). Only if you chose domain option A                                         | Sign up at resend.com → API Keys → Create. I add the domain and its DNS records.                                                                                                                                                                                                                                                                                               | `RESEND_API_KEY`                                           |
| 7   | **Admin inbox** (✅ `wisdomska@gmail.com` is the first Super Admin on preview and production) | The email address that should receive new-booking, order and enquiry alerts, and own the first Super Admin account.                                                                                                                                                                                                                                                            | `SUPER_ADMIN_EMAIL`                                        |

## 3. GitHub settings (needs repository admin rights)

1. **Branch protection.** Repo → Settings → Branches → Add rule, once for `main` and once for `preview`:
   - Require a pull request
   - Require status checks: "Lint, format, typecheck, unit tests", "Integration tests (Postgres)", "Worker build and size", "E2E (Playwright)"
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
- Upstash is no longer needed: rate limits are counted in Postgres (DECISIONS D-40).
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
