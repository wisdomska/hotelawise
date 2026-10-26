# QA report: v1.0.0 release candidate

Date: 26 October 2026. Build: commit `e4e92ad` and later on `senya/nice-darwin-ocn7jo`. Tested: the code, a local production build (Node, Postgres 16) and the deployed preview Worker at https://hotel-a-wise-preview.wisdomska.workers.dev (Cloudflare Workers Free, Neon `preview` branch).

**Verdict: ready for production, with the items under "Not verified" and "Before real money" still open.** Every automated check passes. The release review found and fixed five security problems and two problems that only showed on the deployed Worker (scripts not loading in route groups, the security policy blocking Turnstile).

## Automated checks

| Check                                         | Where                               | Result                                                                  |
| --------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- |
| ESLint (`next/core-web-vitals`, strict TS)    | local                               | 0 errors, 0 warnings                                                    |
| Prettier                                      | local                               | all files formatted                                                     |
| TypeScript (`tsc --noEmit`)                   | local                               | 0 errors                                                                |
| Unit + integration tests (Vitest, Postgres)   | local and CI                        | 598 passed, 45 files                                                    |
| Coverage gate (90%) on `src/lib`, services    | local and CI                        | lines 99.2%, branches 90.8%, functions 98.2%                            |
| End-to-end (Playwright), desktop Chromium     | local production build              | all pass: site, booking, rentals, venues, admin screens, auth, security |
| End-to-end, Pixel 7 (mobile Chromium)         | local production build              | all pass except 4 screenshot comparisons, see below                     |
| End-to-end, WebKit desktop and iPhone 14      | CI                                  | see CI                                                                  |
| Content-Security-Policy, every public page    | deployed preview, desktop and Pixel | no violations on our pages                                              |
| Accessibility (axe), every public page        | deployed preview, desktop and Pixel | 0 violations                                                            |
| Public site flows (filters, prices, lightbox) | deployed preview                    | pass                                                                    |
| Worker size                                   | Cloudflare deploy                   | 2,534 KiB gzip of the 3,072 KiB free-plan limit                         |

The four Pixel screenshot differences (rooms, executive room, gallery, contact) appear only on this machine: the local database carries test bookings that change "rooms left tonight" counts, and fonts render slightly differently here. CI, with a fresh database, compares the same screens.

## Admin (local production build, real database)

Every one of the 14 screens opens for a Super Admin (`tests/e2e/admin-screens.spec.ts`), and these flows run end to end:

- Walk-in booking → check in → take payment (password step-up).
- Promo code: create, pause, delete. Blocked dates: block, unblock.
- Add a room, open it, remove it.
- Every tooltip on the dashboard, bookings and rooms screens stays inside the window at 1440, 1024 and 820 px wide, sidebar open and collapsed.
- Staff see only their 8 screens and get a 403 on Super Admin addresses (`tests/e2e/admin-auth.spec.ts`).
- First sign-in: temporary password → new password (→ two-step set-up when required) → dashboard.

## Deployed preview (live checks)

| Check                                                                                                                                                   | Result                                                                                                                |
| ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Every public route answers (home, rooms, room pages, gallery, contact, rent, rent checkout, venues, book, manage, admin login, health, sitemap, robots) | 200; unknown page 404                                                                                                 |
| Page scripts load in the browser (no redirect loops)                                                                                                    | yes, after the fix below                                                                                              |
| Admin sign-in page: wrong password                                                                                                                      | "That email and password don't match."                                                                                |
| Admin screens when signed out                                                                                                                           | redirect to sign-in                                                                                                   |
| Admin export and invoice links when signed out                                                                                                          | 403                                                                                                                   |
| Paystack webhook without or with a bad signature                                                                                                        | 401                                                                                                                   |
| Guest invoice and calendar links with a wrong token                                                                                                     | 404                                                                                                                   |
| Cron route without the key                                                                                                                              | 404                                                                                                                   |
| A real 15-minute Cron Trigger run                                                                                                                       | ran, outcome ok, no errors                                                                                            |
| Turnstile on forms                                                                                                                                      | widget loads, server secret valid (a dummy token is rejected as "invalid-input-response", not "invalid-input-secret") |
| robots.txt and `X-Robots-Tag` on preview                                                                                                                | disallow all, noindex                                                                                                 |
| Security headers                                                                                                                                        | CSP (nonce on admin and checkout), HSTS, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy        |

### Lighthouse (mobile, simulated slow 4G), deployed preview

| Page         | Performance | Accessibility | Best practices | SEO\* | LCP   | CLS | Server response |
| ------------ | ----------- | ------------- | -------------- | ----- | ----- | --- | --------------- |
| /            | 85          | 100           | 100            | 69    | 3.9 s | 0   | 380 ms          |
| /rooms       | 82          | 100           | 100            | 69    | 4.1 s | 0   | 660 ms          |
| /rooms/std   | 83          | 100           | 100            | 69    | 4.1 s | 0   | 670 ms          |
| /rent        | 85          | 100           | 100            | 69    | 2.9 s | 0   | 340 ms          |
| /contact     | 96          | 100           | 100            | 69    | 2.0 s | 0   | 200 ms          |
| /book        | 82          | 100           | 100            | 69    | 3.0 s | 0   | 350 ms          |
| /admin/login | 98          | 100           | 100            | 63    | 1.5 s | 0   | 310 ms          |

\*SEO only fails "page is blocked from indexing", which the preview does on purpose. Production is indexable.

Performance work in this release: cached pages are served before Next.js starts (server response was 1.1–1.6 s, now 0.2–0.7 s), and the hero, the room-page photo and the first room card load first. The remaining LCP time is the full-width photo on a slow mobile connection; a custom domain (edge caching) and lighter hero crops are the next steps.

## Found and fixed during QA

1. **Pages in route groups didn't run their scripts on the deployed Worker.** Some browsers send `(` and `)` in script paths encoded; Cloudflare's static layer redirected them to the decoded path, in a loop. The build now writes browser script names without brackets. (Local tests can't see this; the deployed-site checks above now cover it.)
2. **The security policy blocked the Turnstile widget** on the deployed site (it isn't loaded locally). Allowed `challenges.cloudflare.com`.
3. **Five security problems** from the release review, listed in [SECURITY.md](SECURITY.md).
4. **Tooltips** could spill off-screen (the collapsed sidebar); now measured and kept inside the window.
5. **Online payment without Paystack keys**: checkout now offers only "Pay at the hotel" / "Pay when you collect" until the keys are set, instead of failing at the last step.

## Not verified (needs a person, or access I don't have)

- **A real guest booking and rental on the deployed site.** Real Turnstile rightly stops a scripted browser, so this needs one human run on the preview: book a room with "Pay at the hotel", reserve a rental, send a contact message, then find all three in the admin.
- **Signed-in admin on the deployed site.** Covered locally against the same build; on the preview it needs your own sign-in.
- **Paystack payments.** Test-mode MoMo and card were checked in milestone 3; live keys haven't been issued.
- **Email and SMS delivery.** No Resend or Arkesel keys yet, so nothing is sent; the code paths are unit-tested.
- **Photo uploads to Cloudinary from the admin.** Signing is tested; an actual upload needs a signed-in browser.
- **WebKit / Safari locally.** Not installed on this machine; CI runs WebKit desktop and iPhone 14.
- **Production deploy.** Blocked by this session's permissions; the steps are in the [RUNBOOK](RUNBOOK.md#first-production-launch).

## Before real money

1. Turn on Settings › Security › "Require two-step sign-in" and enrol every Super Admin.
2. Paystack live keys on production only, and the live webhook URL in the Paystack dashboard.
3. Resend (email) and Arkesel (SMS) keys, so guests get confirmations, reminders and codes.
4. Rotate every secret that was pasted into a chat or email.
