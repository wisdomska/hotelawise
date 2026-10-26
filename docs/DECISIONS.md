# Decisions log

## D-00 The prototype outranks the Handoff (owner ruling)

The owner edited the prototypes after writing `Handoff.md`. Wherever the two disagree, **what the prototype renders wins**.

- Tokens are taken from the prototype source: colours, type, spacing, radii, shadows and motion.
- The Handoff fills gaps the prototype doesn't cover: the data model, integrations and server rules.

The owner's own rulings (D-01 to D-05) and the brief's explicit requirements still apply on top of the prototype. Those requirements are pickup-only rentals, hover gating, reduced motion, the OTP on manage booking, and security rules. Each place where the build adds to the prototype is listed in this log.

Source-of-truth order: **rendered prototypes** (`design/*.dc.html`) → `design/Handoff.md` → `design/uploads/2-ATTACH-hotel-a-wise-spec.md` → build brief (see D-00).

Each entry gives the conflict, the ruling and why. Entries marked **(owner ruling)** come straight from the owner, WISDOMSKA(SENYA). Entries marked **(open)** have a default but are waiting on an answer.

## D-01 Rentals are pickup only (owner ruling, reconfirmed 26 Oct)

**Conflict:** `Checkout.dc.html` still carries delivery, zone and `#track` code. The Handoff says reserve and collect, with no delivery and no public tracking page.

**Ruling:** Follow the Handoff.

- There is no delivery option and no tracking page. Customers are notified at every status change.
- `delivery_zones` and `rental_orders.fulfilment` stay in the schema, disabled by the `rentals.deliveryEnabled = false` setting, so delivery can be switched on later without a migration.

## D-02 Reminders "the day before delivery" mean pickup (owner ruling)

Reminder jobs run the day before check-in, the day before pickup, and on the morning of the return day.

## D-03 Bundles without delivery (owner ruling)

- Bundles (packs, 8–10% off) are kept.
- Delivery fees are dropped.
- The setup fee (GHS 150) appears only as a line in venue quotes.

## D-04 No demo accounts or demo data anywhere (owner ruling)

- The prototype's `admin@hotelawise.com / admin@123` and `kojo@hotelawise.com / staff@123` logins, and the "Reset demo data" button, do not exist on **production or preview**.
- On every environment, the first Super Admin is created with `scripts/create-super-admin.ts`, then must change the password and enrol TOTP on first sign-in. Other users are invited.
- Deployed databases hold only the real catalogue (rooms, rates, venues, rental items, content, photos). The prototype's sample guests, bookings, orders and revenue are not seeded.
- Automated tests create their own users and fixtures on a throwaway Neon `ci` branch, against a Worker built and run inside CI.

## D-05 Hosting: Cloudflare + Neon instead of Vercel + Supabase (owner ruling)

| Docs say                          | Replaced by                   |
| --------------------------------- | ----------------------------- |
| Vercel                            | Cloudflare Workers (OpenNext) |
| Supabase Postgres                 | Neon                          |
| Supabase Auth                     | Better Auth                   |
| Supabase Storage / object storage | Cloudinary                    |
| Vercel Cron                       | Cloudflare Cron Triggers      |

Correctness never depends on cron timing: expired holds are treated as expired in every query.

## D-06 Rental order statuses

**Conflict:** The spec has delivery stages; the Handoff has pickup stages.

**Ruling:** Handoff.

- Statuses run `pending_payment → reserved → ready_for_pickup → collected → returned → completed`, with `cancelled` reachable from any state before `collected`.
- Moving a card back a stage requires a reason, which is written to `order_status_events` and to the audit log (Handoff).

## D-07 Heading font: Cormorant Garamond (prototype)

**Conflict:** The Handoff tokens say Newsreader. The website, checkout and admin prototypes all use Cormorant Garamond for display type.

**Ruling:** Cormorant Garamond, loaded with `next/font/google`. The display sizes, weights and italics are the prototype's.

## D-08 Hero headline (prototype)

**Conflict:** The spec bans "unforgettable memories" and proposes "Arrive at 3am. We'll have the light on." The prototype seeds "Your gateway to unforgettable memories", which is also the old site's line.

**Ruling:** Use the prototype's copy. It's CMS-editable in Content › Home page.

## D-09 Hero by time of day (prototype)

**Conflict:** The Handoff asks for a separate night hero, the front-desk photo with a night grade. The prototype renders the same photo hero by day and by night.

**Ruling:** Follow the prototype.

- There is one photo hero, using the prototype's image and overlay.
- The prototype's `night()` logic (Accra hour, 18:00–06:00) is ported as-is: the hero CSS variables, the lamp-coloured accent word and the "desk lamp is on" line, wherever the prototype renders them.
- The time of day is decided on the client, so the cached HTML stays shared.

## D-10 Executive Plus

**Conflict:** The prototype shows Executive Plus with its own code, `EXE+`.

**Ruling:**

- **Display:** exactly as the prototype does (`EXE+` in admin tables, "Executive Plus" in names).
- **Storage:** a rate variant of the EXE room type, so availability, the tier select and pricing share one model.

## D-11 Manage booking needs a one-time code

**Conflict:** The Handoff says ref + phone. The brief adds an OTP.

**Ruling (owner-confirmed 26 Oct):** This is an addition to the prototype, required by the brief. It is styled in the prototype's manage-booking visual language. Use ref + phone + a 6-digit OTP, sent by email (SMS when enabled). It expires after 10 minutes, allows 5 attempts and is rate-limited.

**Why:** References are short, and a phone number is often known to others. This is standard practice for self-service changes involving money.

## D-12 Pay at hotel

**Ruling:** Store `status = confirmed` with `payment_status = unpaid` ("Confirmed – unpaid" in the UI). No-shows are handled by policy settings (`noShowCharge = first_night`).

## D-13 Holds and the exclusion constraint

**Conflict:** The Handoff holds a rate variant, but a per-room `EXCLUDE` constraint can't see variant-level holds.

**Ruling:**

- A hold allocates a concrete room (first free room of the variant), so it takes part in the constraint.
- Every allocating transaction first deactivates expired holds that overlap the requested range.
- Cron only tidies up.

## D-14 Rental payment (prototype)

**Conflict:** The spec says pay a deposit or in full. The seed list says "rental deposit 50%".

**Ruling:** Follow the prototype checkout. There are two choices:

- Pay online now: the full rental plus a refundable security deposit.
- Pay when you collect: items are held until 10am on pickup day.

There is no 50% option.

## D-15 Payment lands after the hold expired

**Ruling:**

- The webhook re-attempts the allocation. If the room or stock is still free, the booking or order is confirmed as normal.
- Otherwise a full refund is issued through the Paystack Refund API, the guest gets an apology email with alternatives, and staff get an alert.

This matches common OTA practice: never keep money for inventory you can't deliver.

## D-16 Status notifications channel

The Handoff says customers get SMS updates. SMS is off by default (no budget), so email goes out at every step, and SMS is added automatically when `SMS_PROVIDER` is set.

## D-17 Review fixes that must stay fixed (from `design/uploads/pasted-*.png`)

**Public site**

- The mobile booking bar fits at 360–390px, with no clipped cells.
- The sticky "Book" and WhatsApp buttons never cover form fields or content.
- The mobile menu sheet is full width and includes a "Book a room" CTA.
- The sticky header never covers page titles (`scroll-padding-top` + an offset on the Rent hero).
- The hero tint covers the whole image.
- Date fields use the custom DateRangePicker with the "Sun 25 Oct" format, never the native mm/dd/yyyy picker.
- The guest count uses a stepper or a styled slider.
- Phone rows are labelled properly: "Reception" plus alternates, never "Also" twice.

**Admin shell**

- The sidebar collapses, with an edge toggle tab.
- The user card truncates the name and opens an account menu (My account, role, Settings, Light/Dark, Sign out).
- The content uses the full width, with no empty band or stray clipped element.

**Dashboard**

- The donut legend is stacked, with no overlap.
- Dates use one format: "27 Sep" (en-GB, `MMM` short).

**Room status board**

- The name truncates before the check-out date does.

**Rental inventory**

- Action icons sit in fixed slots.
- Tooltips don't cover neighbouring rows.
- Toasts don't cover tables.

**New booking**

- The modal and wizard are centred and wide enough.
- Values never truncate.
- Room types are shown by name.
- Close, Back and Continue have accessible names.

**Kanban**

- Icon buttons are labelled.
- The "Nothing here" empty state is kept.

**Every environment:** there is no "Reset demo data" (D-04).

## D-18 Contact numbers (confirm with the hotel)

**Conflict:** The spec says reception is +233 55 555 7090, with +233 54 012 0400 and +233 55 555 7033 as the other numbers. The old site's footer lists +233 54 012 0400.

**Ruling:** Seed the spec values. All of them are editable in Settings › Contact and feed every tel:, wa.me and footer link.

## D-19 Hovers and reduced motion

- The prototype's hovers aren't gated. All hovers use a Tailwind `hover-hover:` variant, defined as `@media (hover:hover) and (pointer:fine)`.
- Under `prefers-reduced-motion`, motion is replaced by opacity-only transitions. Animations are not removed, as the prototype does with `animation-duration:1ms`.

## D-20 Command palette motion (prototype)

The prototype's palette and overlay motion is kept as designed. Durations stay within the prototype's motion tokens.

## D-21 Admin dark palette (prototype)

**Conflict:** The Handoff lists a navy dark theme (bg `#07072B`, panel `#0E0E3E`).

**Ruling:** Use the prototype's neutral dark tokens:

| Token        | Value                                               |
| ------------ | --------------------------------------------------- |
| `--bg`       | `#111113`                                           |
| `--panel`    | `#1A1A1D`                                           |
| `--side`     | `#18181B`                                           |
| `--lane`     | `#151517`                                           |
| `--ink`      | `#EDEDEF`                                           |
| chart        | `#9A9CE0`                                           |
| `--green`    | `#5BC08A`                                           |
| `--red`      | `#F2857A`                                           |
| `--amberInk` | `#F2B544`                                           |
| lines        | `rgba(255,255,255,.08)` and `rgba(255,255,255,.16)` |

All tokens are copied from `Admin.dc.html`. Dark-mode visual tests compare against the reference screenshots in full.

## D-28 Password hashing runs in Postgres (owner ruling: everything on free plans)

**Measured:** scrypt on the Worker costs ~96 ms of CPU per password check. Workers Free allows 10 ms per request. The owner won't pay for Workers for now, and weakening the hash is not allowed.

**Ruling:** passwords are hashed with **bcrypt at cost 12, computed by Postgres (`pgcrypto`)**.

- Time a Worker spends waiting on the database doesn't count as CPU. A password check now costs the Worker ~1.4 ms; the hash itself takes ~250 ms on the database.
- bcrypt cost 12 is above the OWASP minimum (cost 10), so strength is kept.
- bcrypt reads only 72 bytes, so passwords longer than 72 bytes are refused rather than silently cut.
- The password travels to Neon over TLS, as every query does. Statement logging stays off.

## D-29 Page cache on Workers KV instead of R2

R2 needs a payment method on file, even on its free tier. The ISR cache uses Workers KV instead (free, no card); on-demand revalidation tags stay on D1.

The free KV write allowance (1,000 a day) is far above what a 16-room hotel's content edits produce.

## D-30 Preview site behind a password instead of Cloudflare Access

Cloudflare Zero Trust (Access) asks for a payment method at sign-up. `preview.hotelawise.com` is instead protected by HTTP Basic auth in `src/proxy.ts`:

- Any username; the password is `PREVIEW_PASSWORD`.
- Fails closed if no password is set.
- Sends `noindex` on every response.

The Paystack webhook and `/api/health` stay reachable.

## D-31 Workers Free bundle limit

The compressed Worker must stay under 3 MiB; it is 2,232 KiB after milestone 1. CI fails above the limit.

- Admin-only libraries load with `dynamic()`.
- If the full app outgrows it, `/admin` moves to its own Worker on `admin.hotelawise.com`, which is also free.

## D-32 No CodeQL on the private repository

GitHub code scanning (CodeQL) on a private repository needs GitHub Advanced Security, which is paid. The workflow is removed. Instead:

- Dependabot (free) watches dependencies.
- ESLint runs on every pull request.
- The security pass in milestone 7 adds a dependency audit (`pnpm audit`) to CI.

If the repository is ever made public, CodeQL can come back at no cost.

## D-33 No WhatsApp float or header clock (prototype)

**Conflict:** The Handoff and the spec list a floating WhatsApp button, and a live Accra clock in the nav. The final prototype removed both.

**Ruling:** Follow the prototype. WhatsApp and phone links stay where the prototype puts them:

- Getting here
- Contact
- the room booking card
- checkout

## D-34 First-load knot loader

The prototype shows a full-screen Nyansapo loader ("Turning the key…") on first load.

**Ruling:** Keep it, but only on the first page view of a browser session. It is CSS-only and fades out by 650 ms, so it never blocks rendering or delays the largest paint for the Lighthouse budget.

## D-27 Repository (owner ruling)

**Conflict:** The brief asks for a new repo, `hotel-a-wise`.

**Ruling:** The owner chose the existing private repo `wisdomska/hotelawise`. Package name: `hotel-a-wise`.

## D-35 Receipts go by SMS and email, not WhatsApp

**Conflict:** The prototype's copy says receipts arrive "by SMS and WhatsApp". Sending WhatsApp messages needs the WhatsApp Business API, which isn't part of v1.

**Ruling:** Say only what happens: receipts go by SMS (once an SMS provider key is set) and by email when the guest gives one. The wording on step 2 and the confirmation page says exactly that.

## D-36 Manage my booking asks for a code

**Conflict:** The prototype finds a booking with the reference and phone alone, and shows a demo hint. The owner asked for the OTP to work, and there are no demos anywhere (D-04).

**Ruling:** Reference + phone sends a 6-digit code to that phone (and email, if on file). The code lasts 10 minutes, allows 5 tries, and at most 3 codes go out per booking in 10 minutes. A correct code gives a signed pass for that one booking for 30 minutes. The demo hint is gone.

## D-37 The payment sheet waits for Paystack, with no test buttons

**Conflict:** The prototype's payment sheet has "Approve" and "Decline" buttons to simulate Paystack.

**Ruling:** The sheet is real. MoMo sends a prompt to the guest's phone (Telecel's voucher step included), card payments open Paystack's own window, and the sheet polls until Paystack verifies. It gains a "No prompt? Close and try again" link, so nobody is stuck if a prompt never arrives. Confirmation still comes only from verified transactions (webhook, or the same check run on demand).

## D-38 Hold countdowns use the time remaining, not the clock

A phone with its clock set wrong would show a fresh hold as expired. The server returns how many milliseconds the hold has left, and the page counts down from when it received that.

## D-39 The Worker is built with webpack

Turbopack bundles server code once for pages and again for route handlers (auth, Paystack webhook, calendar files), which put the Worker at 2.66 MiB of the free plan's 3 MiB. A webpack build shares those modules and comes to 2.30 MiB with the same routes. Local development and the e2e server keep Turbopack; only `pnpm cf:build` (set in `open-next.config.ts`) uses webpack.

## D-40 Rate limits are counted in Postgres, not Upstash

Upstash is blocked on the owner's network (Sophos), and adding another service only for counters isn't worth it. Each check is one atomic upsert on a `rate_limits` row (`env:rule:caller`), a fixed window per rule, so every Worker isolate shares the same count. If the database can't be reached the check falls back to the isolate's in-memory window instead of turning guests away. Windows older than a day are deleted by the nightly housekeeping job.

## D-41 The preview site is open to anyone with the link

The owner asked for the preview to open without a password. `PREVIEW_GATE=off` in `wrangler.jsonc` turns the Basic-auth gate off; every page still sends `X-Robots-Tag: noindex, nofollow` and robots.txt disallows everything, so search engines stay away. Payments on preview use Paystack test keys only. Setting `PREVIEW_GATE` to `on` brings the password back.
