# Decisions log

Source-of-truth order: `design/Handoff.md` → rendered prototypes (`design/*.dc.html`) → `design/uploads/2-ATTACH-hotel-a-wise-spec.md` → build brief.

Each entry gives the conflict, the ruling and why. Entries marked **(owner ruling)** come straight from the owner, WISDOMSKA(SENYA). Entries marked **(open)** have a default but are waiting on an answer.

## D-01 Rentals are pickup only (owner ruling)
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

## D-04 Demo credentials are preview only (owner ruling)
- `admin@hotelawise.com / admin@123` and `kojo@hotelawise.com / staff@123` are seeded only when `APP_ENV=preview`. "Reset demo data" exists only there.
- Production has no default accounts. The first Super Admin comes from `scripts/create-super-admin.ts` and must change the password and enrol TOTP on first sign-in.

## D-05 Hosting: Cloudflare + Neon instead of Vercel + Supabase (owner ruling)
| Docs say | Replaced by |
|---|---|
| Vercel | Cloudflare Workers (OpenNext) |
| Supabase Postgres | Neon |
| Supabase Auth | Better Auth |
| Supabase Storage / object storage | Cloudinary |
| Vercel Cron | Cloudflare Cron Triggers |

Correctness never depends on cron timing: expired holds are treated as expired in every query.

## D-06 Rental order statuses
**Conflict:** The spec has delivery stages; the Handoff has pickup stages.

**Ruling:** Handoff.
- Statuses run `pending_payment → reserved → ready_for_pickup → collected → returned → completed`, with `cancelled` reachable from any state before `collected`.
- Moving a card back a stage requires a reason, which is written to `order_status_events` and to the audit log (Handoff).

## D-07 Heading font (open, Q1)
**Conflict:** The Handoff tokens say Newsreader. The prototype's saved Tweak default is `cormorant` (Cormorant Garamond), and the reference renders use it.

**Ruling:** Newsreader, because the Handoff is the higher source. It is a single token, so swapping costs nothing if the owner prefers Cormorant.

## D-08 Hero headline (open, Q2)
**Conflict:** The rendered prototype seeds "Your gateway to unforgettable memories", which is also the old site's line and appears in the review screenshots. The spec bans "unforgettable memories" and proposes "Arrive at 3am. We'll have the light on."

**Ruling:** Follow the prototype, which is the higher source. The headline is CMS-editable (Content › Home page).

## D-09 Night/day hero
**Conflict:** The Handoff requires a night/day hero by Accra hour (night is 18:00–06:00), and the image renames say `hotel-view-reception.jpg` is the night hero. The final prototype renders the same hero by day and by night.

**Ruling:** Implement the Handoff.
- **Day:** Executive bedroom (`hero-front-desk.jpg`, renamed) with grade `saturate(.92) contrast(1.04)`.
- **Night:** the front desk (`hotel-view-reception.jpg`, renamed) with grade `saturate(.8) brightness(.72) contrast(1.1) sepia(.12)`.

The choice is made on the client from the Accra clock, so the cached HTML stays shared. Both images are `srcset`'d, and only the active one is high priority.

## D-10 Executive Plus
**Conflict:** The prototype data uses a separate room code, `EXE+`.

**Ruling:** Model it as a rate variant of EXE (`EXECUTIVE` GHS 200, `EXECUTIVE_PLUS` GHS 250), as the spec and the Handoff data model do. The public code stays `EXE`, and the variant is chosen at booking, as in the prototype's tier select.

## D-11 Manage booking needs a one-time code
**Conflict:** The Handoff says ref + phone. The brief adds an OTP.

**Ruling:** Use ref + phone + a 6-digit OTP, sent by email (SMS when enabled). It expires after 10 minutes, allows 5 attempts and is rate-limited.

**Why:** References are short, and a phone number is often known to others. This is standard practice for self-service changes involving money.

## D-12 Pay at hotel
**Ruling:** Store `status = confirmed` with `payment_status = unpaid` ("Confirmed – unpaid" in the UI). No-shows are handled by policy settings (`noShowCharge = first_night`).

## D-13 Holds and the exclusion constraint
**Conflict:** The Handoff holds a rate variant, but a per-room `EXCLUDE` constraint can't see variant-level holds.

**Ruling:**
- A hold allocates a concrete room (first free room of the variant), so it takes part in the constraint.
- Every allocating transaction first deactivates expired holds that overlap the requested range.
- Cron only tidies up.

## D-14 Rental payment amount (open, Q3)
**Conflict:**
- Spec: deposit or full.
- Handoff: pay online in full, including the refundable security deposit, or pay at pickup.
- Seed assumption: "rental deposit 50%".

**Ruling:** The Handoff flow. The 50% value is kept as an unused setting until the owner decides.

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

**Production:** there is no "Reset demo data" (D-04).

## D-18 Contact numbers (confirm with the hotel)
**Conflict:** The spec says reception is +233 55 555 7090, with +233 54 012 0400 and +233 55 555 7033 as the other numbers. The old site's footer lists +233 54 012 0400.

**Ruling:** Seed the spec values. All of them are editable in Settings › Contact and feed every tel:, wa.me and footer link.

## D-19 Hovers and reduced motion
- The prototype's hovers aren't gated. All hovers use a Tailwind `hover-hover:` variant, defined as `@media (hover:hover) and (pointer:fine)`.
- Under `prefers-reduced-motion`, motion is replaced by opacity-only transitions. Animations are not removed, as the prototype does with `animation-duration:1ms`.

## D-20 Command palette and keyboard actions are not animated
The prototype animates the palette. Following the motion skill, the ⌘K palette opens and closes instantly, because it's used many times a day. Toasts, drawers and sheets keep their motion tokens.

## D-27 Repository (owner ruling)
**Conflict:** The brief asks for a new repo, `hotel-a-wise`.

**Ruling:** The owner chose the existing private repo `wisdomska/hotelawise`. Package name: `hotel-a-wise`.
