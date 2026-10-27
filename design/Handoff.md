# Hotel A-Wise: Handoff notes for Claude Code

Source of truth: `uploads/2-ATTACH-hotel-a-wise-spec.md`. These notes cover what the prototypes add: screen inventory, data needs, states and seed assumptions.

## Files
| File | What it is |
|---|---|
| `Design System.dc.html` | Brand sheet, tokens (colour, type, space, radius, shadow, motion) and interactive component states |
| `Website.dc.html` | Public marketing site. Hash routes: `#` home, `#rooms`, `#room/{STD,EXE,VIP,DBL}`, `#gallery`, `#contact`, anything else → 404 |
| `Checkout.dc.html` | Transactional flows: `#book`, `#manage`, `#rent`, `#rent/checkout`, `#venues` |
| `Admin.dc.html` | `/admin` CMS. Sign-in + 2FA, 14 screens, ⌘K search, dark mode (moon/sun toggle), tabs on every multi-section screen, stepped forms, paginated tables (8 rows), tooltips on icon buttons |
| `store.js` | Shared prototype data layer standing in for the API. localStorage-backed, syncs live across tabs. Replace with real endpoints |

## Accounts & security (prototype → production)
- Default Super Admin: **admin@hotelawise.com / admin@123** (then any 6-digit 2FA code). Staff: kojo@hotelawise.com / staff@123.
- Passwords are plain text in `AWStore.accounts` for the prototype only. Production: bcrypt/argon2 hashes, real TOTP, emailed reset codes with 10-minute expiry, rate limiting server-side.
- Sign-in locks for 30s after 5 wrong tries. "Forgot your password?" sends a 6-digit code (shown on screen in the demo), then sets a new password (8+ chars, letters and a number).
- My account (person icon, bottom of the sidebar): change name, email (needs current password) and password.
- Every money action asks for the signed-in user's password: recording payments (plus transaction ID for MoMo/card), refunds, approving refunds, rental payments, and return checklists that refund a deposit.

## Pricing
- `AWStore.stayPrice(type, checkIn, nights)` = base rate per night ± active rate rules (set dates every year, Fri/Sat nights, long stays; % or GHS; per room type). Used by website, checkout, manage booking, and admin bookings.
- Promo codes (`promoCodes`): % off room, GHS off, or free breakfast; optional end date, room type and minimum nights; pause/delete; usage counted when a booking is saved. Guests apply them on the checkout Pay step.
- Room types (name, beds, sleeps, bathroom, best for, amenities, price) are edited in Rooms & rates › Room types and feed the website and checkout.
- Rental and venue boards can move cards back a stage; a reason is required and saved to the record's history and the audit log. Checked-in bookings can be undone the same way.

## How the site and admin talk to each other (prototype → production)
Every write in one surface shows up in the other. In production each line below is an API call + DB write; in the prototype it's `AWStore`.
- **Admin → site (photos):** Content › Photos has 29 photo slots: home hero, venues banner, testimonial, footer (both sites), every room photo (main + gallery; main also feeds room cards and checkout), the 8 overview tiles, 3 rental cards, 2 venue photos. Replace uploads and resizes to ≤1600px JPEG; the undo button restores the original. Rental item photos: Rental inventory › image icon. Gallery: Content › Gallery (upload, alt text, category, order, delete). In production these become uploads to object storage + an `images(key, url)` table.
- **Admin → site (content):** Content › Home page (hero headline and line, every section heading, 8 overview tile names), Other pages, Rooms (descriptions), Venues (name, label, capacity, description), FAQ, Testimonials, Banner, Gallery; Settings › Contact (phone, WhatsApp, email, address appear in every call/WhatsApp/email link and footer on both sites). Blank fields fall back to the default copy.
- **Admin → site:** room rates (Rooms & rates › Prices), room status (Maintenance/Out of order removes a room from sale), blocked dates, rental item price/deposit/stock/repairs, gallery (category, order, delete; photos without alt text are hidden), FAQ, testimonials (first live one shows on Home), banner text/toggle, breakfast price, room-service fee, deposit %, “Pay at the hotel” toggle.
- **Site → admin:** room bookings (room auto-assigned to the first free room of the type), manage-booking date changes and cancellations (cancellations raise a refund “Pending approval”), rental reservations, venue enquiries, contact-form messages (Inbox), newsletter sign-ups (Customers › Newsletter).
- **Availability** = rooms of the type − overlapping active bookings − rooms in Maintenance/Out of order − blackouts. **Rental stock** = owned − in repair − units on overlapping active orders (return day included).
- Settings › Reset demo data restores the seed.

Every file has Tweaks for **Viewport** (auto / desktop / mobile in a 390px frame) and **simulated states**. Admin also has **Role** (super/staff), **Dark** and **Start at** (any screen, or `login`).

## Tokens (implement as Tailwind theme + CSS variables)
- **Colour:** midnight `#000063`, ink `#00003A`, paper `#F5F2EA`, mist `#E3E4F5`, lamp `#F2B544` (<5% of a screen), surface `#FFFFFF`, success `#1F7A4D`, error `#B42318`. Admin dark: bg `#07072B`, panel `#0E0E3E`, text `#ECEBF4`, chart `#6E70C9`, green `#5BC08A`, red `#F2857A`.
- **Type:** Newsreader (display, opsz 6–72, 300/400 + italic), Geist (UI 400/500/600), Geist Mono (codes, times, prices, labels). Display xl `clamp(60px,7.2vw,120px)/0.95/-2.5%`, h2 `clamp(40px,4.6vw,72px)/1`, body 15–18/1.5, mono labels 11–12 with +8% tracking and uppercase.
- **Space:** 4, 8, 12, 16, 24, 32, 48, 64, 96, 136. Page padding 56 desktop / 20 mobile. Section rhythm 136 / 72.
- **Radius:** 2 images · 10 controls · 12 cards · 16 mobile sheet top · 999 chips.
- **Shadow:** hairline border `rgba(0,0,99,.14)` · lift `0 18px 40px -24px rgba(0,0,58,.45)` · overlay `0 30px 60px -20px rgba(0,0,40,.5)`.
- **Motion:** enter `cubic-bezier(0.23,1,0.32,1)`, move `cubic-bezier(0.77,0,0.175,1)`. Press 160ms scale(.97). UI 150–300ms. Sheets 360–420ms. Hero word stagger 45ms/word, 700ms. Only transform/opacity/clip-path. Gate hovers with `@media (hover:hover)` (the prototype's inline hovers aren't gated, so do this in Tailwind with a `hover-hover:` variant). Under `prefers-reduced-motion`, swap to opacity-only.
- **Image grade:** `saturate(.92) contrast(1.04)`. Night hero: `saturate(.8) brightness(.72) contrast(1.1) sepia(.12)`.

## Components (build in `/components`)
KeyCard · ReceiptLine · StockBadge · QuantityStepper (step 10 for items with ≥100 stock) · DateRangePicker (2 months desktop, 1 mobile; sold-out struck + disabled; blocks ranges that cross a sold-out night) · BookingSummary (sticky card → Vaul drawer on mobile) · ReservationSummary (sticky card on desktop, bottom bar + Vaul sheet on mobile; shared by room booking and rentals) · OrderStatusTracker · Toaster (Sonner, bottom-right, max 3) · PaymentSheet (Paystack inline) · DataTable (generic, status chips, row actions) · Timeline (rows × 14 days, drag to move, right-edge drag to extend, clash check) · Kanban · RoleAwareSidebar · CommandPalette (cmdk) · LiveClock (`Africa/Accra`, 10s tick) + AwakeDot · NyansapoMark / Loader.

## Public screens
| Screen | Data | States |
|---|---|---|
| Home | room types + live "left tonight", rental items (from price), coming-soon flags, testimonial, settings (phones, address, pin) | night/day hero by Accra hour (18:00–06:00 night), loading skeleton for key-cards, sold-out badge, offline banner, booking-bar date error |
| Rooms | room types, rates, availability tonight | filters (guests, budget), empty "nothing fits", loading |
| Room detail | type, gallery, amenities, house rules, rate variants, add-on prices | tier select (EXE), live total, invalid dates, mobile drawer, lightbox (←/→/Esc), similar rooms |
| Gallery | gallery items (src, alt, category, order) | filter chips + counts, empty, lightbox |
| Contact & FAQ | settings, FAQ items | field errors (Ghana phone), sending, success toast |
| 404 | room types | n/a |
| Global | n/a | sticky Book (mobile), WhatsApp float, newsletter validation, first-load knot loader (≤650ms) |

## Transactional flows
**Room booking (`/book`)**
1. Dates & room. Availability is computed per rate variant for `[check_in, check_out)`. Blackout and full nights are disabled. Badges: "N left", "Last one", "Sold out these dates", "Sleeps 2". Shows a loading state on every date change, and an all-sold-out state with the nearest free date suggestions.
2. Guest details: name, phone (country picker, GH validation), optional email, arrival hour 00–23, notes.
3. Pay: full / 30% deposit / pay at hotel (CMS toggle `payAtHotel`). Methods: MTN, Telecel, AirtelTigo MoMo, card. The **15-minute hold** starts when leaving step 1 (`booking_holds` row with `expires_at`). Shows the hold-expired banner and the payment-failed inline state (retry, use card, call).
4. Confirmation: ref `AW-XXXX`, paid/balance, .ics, directions, SMS/WhatsApp and email receipt.

**Manage booking:** lookup by ref + phone → view, change dates (availability re-check, price delta), cancel (policy-driven refund amount). States: not found, change unavailable, cancelled.

**Rentals (reserve & collect, no delivery):** pick dates → catalogue with stock for those dates + packs, with a sticky "Your reservation" summary (no cart drawer) → Your details (who's collecting) + pickup/return card (No. 1 Wisepak Lane, from 7am on start date, back by 6pm the day after end) → Pay online now (MoMo/card, full incl. refundable deposit) **or** pay when you collect (desk: cash/MoMo/card; items held until 10am on pickup day) → confirmation `AWR-XXXX` with pickup .ics + directions. Staff move it Reserved → Ready for pickup → Collected → Returned → Completed in the admin; customers get SMS updates (no public tracking page).

**Venues:** compound (100–200) and conference room, enquiry form → `EQ-XXX`.

## Admin screens (each one checks permissions on the server)
| Screen | Super Admin | Staff (hidden, not disabled) |
|---|---|---|
| Sign in | email + password + **TOTP 2FA required** | email + password (2FA optional) |
| Dashboard | KPIs incl. revenue today/week/month, rooms vs rentals chart, 30-day occupancy | no revenue KPIs, no revenue chart, no money totals on pending |
| Room bookings | table + rooms×days timeline (drag move/extend), quick add, payments, **refund, delete**, invoices, notes | same minus refund/delete |
| Rooms & rates | room status board, types/rates, seasonal, promos, blackouts, policies (editable) | read-only, but **can change room status** |
| Rental orders | list / calendar / pipeline, status advance, return checklist → **completes and refunds** | checklist submits refund **for approval** |
| Rental inventory | items, price/deposit edit, stock by date, zones | view, ±repair units (price edit only with `inventoryEdit` grant) |
| Venues & enquiries | pipeline + quote builder + calendar | pipeline; quote builder only with `venueQuotes` |
| Payments & refunds | transactions, refunds queue (approve), deposits held, cash-up, CSV/Excel | no access |
| Customers | profiles, history, repeat flag, notes, lifetime spend | same minus spend |
| Reports | occupancy, ADR, RevPAR, revenue per type, best sellers, staff activity | only with `reports` grant |
| Content | gallery (alt text required before publishing), pages, FAQ, testimonials, coming-soon toggles, banner | only with `content` grant; no deletes |
| Inbox | assign, status, reply | full |
| Settings | contact, hours, fees, pay-at-hotel, keys (reveal needs fresh 2FA), taxes, templates, session timeout | no access |
| Users & permissions | invite, reset, deactivate (never the last Super Admin), per-staff toggles: content, reports, inventoryEdit, venueQuotes, exports; sign-in history | no access |
| Audit log | every mutation: who, action, target, before → after, when | no access |

Global: ⌘K palette (screens, actions, booking/rental search filtered by role), dark mode, mobile off-canvas sidebar, toasts, 30-min idle timeout.

## Data model (Postgres)
`room_types(id, code, name, description, capacity, beds, amenities[], photos[])` · `rate_variants(id, room_type_id, name, price_ghs)` · `rooms(id, number, room_type_id, rate_variant_id, status enum[available,occupied,cleaning,maintenance,out_of_order])` · `rate_rules(id, name, starts, ends, weekdays[], room_type_ids[], adjust_type, adjust_value, active)` · `promo_codes` · `blackout_dates(id, starts, ends, room_ids[] null=all, reason)` · `policies(key, value)`
`customers(id, name, phone_e164, email, notes, is_repeat)` · `bookings(id, ref, customer_id, rate_variant_id, room_id, check_in, check_out, guests, arrival_hour, requests, status enum[pending_payment,confirmed,checked_in,checked_out,cancelled,no_show], source enum[web,phone,walk_in,whatsapp], total, notes)` · `booking_charges(id, booking_id, kind[room,breakfast,room_service,other], qty, unit_price)` · `booking_holds(id, rate_variant_id, check_in, check_out, expires_at, session_id)`
`rental_items(id, name, spec, photos[], price_per_day, deposit_per_unit, stock_total, units_in_repair, archived, is_custom)` · `bundles(id, name, pct_off)` + `bundle_items` · `rental_orders(id, ref, customer_id, starts, ends, occasion, pay_mode[online,at_pickup], pickup_at, return_by, collected_by, status enum[pending_payment,reserved,ready_for_pickup,collected,returned,completed,cancelled])` · `order_lines(id, order_id, item_id, qty, unit_price, days)` · `return_checklists(id, order_id, by_user_id, lines jsonb{item_id, returned, damaged, missing}, deduction, refund, approved_by)`
`venues` · `enquiries(id, ref, venue_id, date, guests, stage[new,quoted,deposit_paid,done], quote jsonb, customer_id)` · `payments(id, ref, booking_id|order_id|enquiry_id, amount, method[mtn,telecel,airteltigo,card,cash,pos], channel[paystack,desk], paystack_ref, status, by_user_id)` · `refunds(id, payment_id, amount, reason, status[pending_approval,refunded,rejected], requested_by, approved_by)` · `messages` + `message_replies`
`users(id, name, email, role[super_admin,staff], totp_secret, active)` · `user_permissions(user_id, key, enabled)` · `login_events` · `audit_log(id, user_id, action, entity, entity_id, before jsonb, after jsonb, at, ip)` · `content_pages`, `gallery_items(id, src, alt NOT NULL for published, category, position)`, `faqs`, `testimonials`, `coming_soon(key, now_open)`, `banner`, `settings(key, value)`.

Availability = room count per rate variant − overlapping bookings (not cancelled) − active holds − blackouts. Rental stock on a date = `stock_total − units_in_repair − Σ qty` of orders whose `[starts, ends+1]` covers that date (the day after is kept for collection).

## Seed assumptions (not in the spec, so confirm with the hotel)
- Room counts and numbers: STD 101–106, DBL 107–108, EXE 201/202/205, EXE Plus 203/204, VIP 206–208 (16 rooms).
- Breakfast add-on GHS 50 per guest per day. Check-in 14:00, check-out 12:00. Free cancellation >48h. Room deposit 30%. Rental deposit 50% + security deposit.
- Rental prices per day: canopy 250, long table 40, short table 25, foldable chair 5, regular chair 3, tablecloth 15, chair cover 4. Packs 8–10% off. Zones GHS 50/100/180/250. Setup GHS 150. Venue hire for quotes: compound 2,500, conference 800.
- Staff names, guests, orders and revenue figures are seed data.
- **Image filenames don't match their content in the zip.** `hero-front-desk.jpg` is an Executive bedroom, `hotel-view-reception.jpg` is the real front desk (used for the night hero), `contact-hero.jpg` is the ground-floor lounge, `gallery-events-hero.jpg` is a corridor and `private-events.jpg` is the outdoor wedding in the compound. Rename these when importing. `breakfast.jpg` and `summer-hut.jpg` are concept images and always carry a "Concept image" label. The summer-hut image shows a pool that A-Wise doesn't have, so replace it before launch. The regular plastic chair has no photo yet.

## Integrations
Paystack inline (`channels: ['mobile_money','card']`, MoMo provider by network) with webhook → `payments`, which confirms the booking or order and releases the hold. Refunds go through the Paystack Refund API. SMS/WhatsApp via a Ghana provider (e.g. Hubtel or Arkesel) + WhatsApp Cloud API. Email via Resend. Reminders run the day before check-in, delivery and return. Schema.org `Hotel` + `LocalBusiness`, OG image per room, sitemap.
