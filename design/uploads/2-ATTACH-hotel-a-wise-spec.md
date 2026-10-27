# Hotel A-Wise: Full Product Spec (attach this file to Claude Design and to Claude Code)

This is the source of truth for the brand, content, features, CMS and roles. When this file and a short prompt disagree, this file wins.

### ROLE
You are a senior brand designer, UX designer and design engineer. Build a complete marketing website and booking flow for **Hotel A-Wise**, plus a full **admin CMS**. The result must feel one of a kind, with a clear point of view, and nothing like a hotel template. If any screen could pass as "a generic hotel site", redo it.

### THE HOTEL (source of truth: do not invent facts)
- **Hotel A-Wise**, No. 1 Wisepak Lane, New Asofan, Accra, Ghana. Google Maps pin: 5.6455136, -0.2869356.
- Promise: **affordable luxury**. It's a small, warm, family-run hotel that is premium on the details and honest on price.
- **Open 24 hours, 7 days a week, holidays included.** You can check in at 3am.
- Reception and bookings: +233 55 555 7090. Other numbers: +233 54 012 0400 and +233 55 555 7033. Email: info@hotelawise.com.
- Breakfast is served 7 to 10am daily. Room service is an extra GHS 20.
- Second-floor conference room. Outdoor compound for events of 100 to 200 guests.
- Rentals: canopies, long and short tables, and plastic chairs (foldable and regular) for weddings, funerals and parties.
- Spaces: first- and second-floor porches, a spacious hallway, two receptions (first and second floor), premium bathrooms and customised bed linen.
- Coming soon: **Breakfast** (an all-day West African dining concept) and **Summer Hut** (an open-air sundowner lounge).
- Testimonial: *"Our stay at Hotel A-Wise was nothing short of extraordinary. From the moment we arrived, we were greeted with warmth and professionalism. The room was impeccably clean, the bed incredibly comfortable…"* (John & Mary P., Achimota)

### ROOMS AND PRICING (currency: GHS, Ghana cedi, per night)
| Room | Price | Notes |
|---|---|---|
| Standard | GHS 150 | 1 queen bed, 2 guests, private bathroom, Wi-Fi, flat-screen TV |
| Executive | GHS 200 / GHS 250 | Two tiers (for example Executive and Executive Plus). Larger room and upgraded bathroom |
| VIP | GHS 300 | Premium finishes, VIP bathroom |
| Double | GHS 400 | Two beds, suited to families and friends sharing |

Show prices clearly and early. The price is the hook ("luxury you can actually afford"). Never show USD. Do **not** include Royal Penthouse, Presidential Suite or Deluxe Room. Those were template placeholders.

### BRAND CONCEPT: "The hotel that never sleeps"
Build the identity around a real fact: A-Wise is awake 24/7. The main colour **#000063** is the deep Accra midnight. The single accent is the **warm amber glow of a lit window**, meaning someone is always at the front desk.

- **Motif:** subtly use the Adinkra symbol **Nyansapo** (the "wisdom knot"), a natural fit for "A-Wise". Use it as the favicon, loader, section dividers and a watermark on the booking confirmation. Draw it as a clean monoline mark, not clip-art.
- **Signature details (required):**
  1. A **live Accra clock** in the nav: "Front desk is awake · 03:12 GMT", with a softly breathing amber dot.
  2. The **hero changes with the real Accra time**: deep midnight with lit windows at night, and a lighter, paper-toned version during the day. Same layout, different mood.
  3. **Room cards styled as key cards / key tags**, each with its room code (STD, EXE, VIP, DBL) in a monospace font, like a brass key fob.
  4. Price tags that read like a **receipt line**: `VIP ........ GHS 300 / night`.
- **Voice:** warm, plain-spoken, a little witty and confident. It should sound like a friendly Ghanaian host, not a brochure. Examples: "Arrive at 3am. We'll have the light on." / "Luxury, minus the markup." Ban these phrases: "unforgettable memories", "indulgence knows no bounds", "nestled", "oasis", "elevate".

### VISUAL SYSTEM
- **Colours:**
  - Midnight `#000063` (primary)
  - Ink `#00003A` (deepest surfaces)
  - Paper `#F5F2EA` (warm off-white background)
  - Mist `#E3E4F5` (cool tint)
  - Lamp `#F2B544` (accent, under 5% of any screen, used only for "awake", live and primary-action moments)
  - Success `#1F7A4D` / Error `#B42318`
  - No purple gradients and no glassmorphism soup.
- **Type:** an editorial display serif with character (for example Gambetta, Fraunces at high optical size, or Newsreader), a crisp grotesk for UI (for example General Sans or Geist, **not Inter**), and a monospace (JetBrains Mono or Geist Mono) for room codes, times and prices.
- **Layout:** an asymmetric editorial grid, oversized type, generous negative space and real photography given room to breathe. Use full-bleed images and tight captions, like a print magazine. Radii: 2px on images and 10px on interactive surfaces.
- **Photography:** use the hotel's real photos (placeholders labelled with their real subjects: Standard Room, Executive Room, VIP Room, Double-Bed Room, VIP Bathroom, Conference Room, First-Floor Porch, Second-Floor Porch, Hotel Compound, Staircase, Reception during event). Apply one consistent subtle grade (slightly cool shadows, warm highlights) so mixed phone photos feel like one set.

### MOTION: follow Emil Kowalski's design-engineering principles (animations.dev, Sonner, Vaul)
- Animate only `transform` and `opacity` (plus `clip-path` for reveals). Never animate layout properties.
- Custom easing, not the browser defaults: ease-out `cubic-bezier(0.23, 1, 0.32, 1)` for entering, ease-in-out `cubic-bezier(0.77, 0, 0.175, 1)` for on-screen movement. Keep UI transitions at **150 to 300ms**. Hero and page moments can go to 500 to 700ms.
- Buttons get `scale(0.97)` on press. Never animate from `scale(0)`. Start at `scale(0.95)` and `opacity: 0`.
- Popovers and dropdowns scale from their trigger (`transform-origin` set to the trigger). Modals scale from the centre.
- Prefer interruptible CSS transitions or spring physics over keyframes for anything the user can toggle.
- Use **Vaul-style drawers** for booking on mobile (drag to dismiss, velocity-aware, background scales down).
- Use **Sonner-style stacked toasts** for confirmations ("Request sent. Reception will call you within 15 minutes.").
- Staggered text reveals on headings (30 to 50ms per word, using a clip-path mask). Image reveals use an `inset()` clip-path wipe on scroll, once only.
- Gate hover effects with `@media (hover: hover)`. Fully respect `prefers-reduced-motion` with opacity-only fallbacks.
- Rule: frequent actions get little or no animation. Rare moments (first load, booking confirmed) get the delight. Nothing should ever feel slow.

### SITE MAP AND KEY SCREENS
1. **Home:** time-aware hero ("Arrive at 3am. We'll have the light on."), an inline **booking bar** with two tabs, **Stay** (dates, guests, Book) and **Rent** (event date, Browse rentals), a key-card room strip with prices, "What's here" facilities shown in an editorial layout, a rentals strip (canopies, chairs, tables with "from GHS x / day" and an "Order now" link), the testimonial, a coming-soon peek (Breakfast, Summer Hut) and a map/arrival block.
2. **Rooms:** all four types, a **side-by-side comparison table** (beds, guests, bathroom tier, price) and filters by guests and budget.
3. **Room detail:** a gallery with a lightbox, amenities, house rules and a **sticky booking card** (a drawer on mobile) showing the live total: nights × rate + optional breakfast/room service. Include "Similar rooms".
4. **Online room booking (real, live availability, no account needed):**
   - Step 1, **Dates & room:** a date-range picker that greys out sold-out dates, a guest count, and room types with **live availability** ("2 left"). Executive shows both price tiers. The running total shows nights × rate, plus breakfast and room service add-ons.
   - Step 2, **Guest details:** name, phone (Ghana format with country picker), email, arrival time (any hour, 24/7), special requests.
   - Step 3, **Pay & confirm:** pay in full or pay a deposit online with **Paystack (Mobile Money: MTN, Telecel, AirtelTigo, plus Visa and Mastercard)**. A "Pay at hotel" option can be switched on or off in the CMS.
   - Inventory is **held for 15 minutes** during checkout so the same room can't be booked twice.
   - **Confirmation:** booking reference, receipt by email and SMS/WhatsApp, add-to-calendar, directions.
   - **Manage my booking:** guests open it with their reference and phone number to view, change dates (subject to availability) or cancel under the cancellation policy, with an automatic refund rule.
   - Always show "Prefer to talk? Call, or WhatsApp +233 55 555 7090".
5. **Events & Rentals: online rental ordering (shop-style):**
   - **Rental catalogue:** canopies, long tables, short tables, foldable chairs, regular chairs, plus any item the admin adds (for example tablecloths, chair covers, canopy drapes, or the event compound and conference room as bookable venues). Each item has photos, size and specs, a **daily price per unit**, and **live stock for the chosen dates** ("140 chairs available on 12 Dec").
   - **Order flow:** pick event dates (start and end) → add items with quantity steppers to a **rental cart** (a Vaul drawer on mobile) → choose **delivery to the venue** (address, area-based delivery fee, setup option) or **pickup from the hotel** → customer details → pay a deposit or the full amount with Paystack → confirmation with an order reference and receipt.
   - Bundles such as a "Wedding pack" (canopies + 100 chairs + 10 tables) give a discount.
   - The security deposit and damage policy are shown before payment.
   - **Track my order:** status steps (Confirmed → Preparing → Out for delivery → Delivered → Collected/Returned), shown with the order reference and phone number.
   - The venue enquiry form for the compound (100 to 200 guests) and the conference room stays as an alternative for custom events.
6. **Gallery:** a filterable masonry grid (Rooms, Bathrooms, Spaces, Events) with a keyboard-accessible lightbox.
7. **Contact & FAQ:** the map, one primary phone plus secondary numbers, WhatsApp, email, the contact form (subjects: Reservation, Special request, Feedback, Events & rentals) and an FAQ with **real, CMS-editable answers**.
8. **404 page:** "This room doesn't exist. But these do." Show the room cards.
9. **Global:** a sticky "Book" button on mobile, a floating WhatsApp button, a footer with the live clock and a newsletter sign-up.

### UX REQUIREMENTS
- Mobile-first (most guests will arrive on phones in Ghana). Lighthouse 95+ and LCP under 2.0s on 4G. Images in AVIF/WebP with blur placeholders.
- WCAG 2.2 AA: visible focus rings, real alt text, 44px minimum touch targets, no duplicated DOM content.
- Every phone number is a working `tel:` link, plus a `wa.me` link.
- SEO: `Hotel` and `LocalBusiness` schema.org markup, OG images per room and a sitemap.
- Microcopy for empty, loading and error states. Calendars show unavailable dates clearly.

### ADMIN CMS (`/admin`): calm, fast, same brand but quieter
Design a dense, keyboard-friendly admin (a command palette on ⌘K, a sidebar and a dark-mode option) with:
1. **Dashboard:** today's arrivals and departures, occupancy %, **rental orders going out and coming back today**, revenue (rooms vs rentals; today, week, month), pending payments, upcoming events and a 30-day occupancy chart.
2. **Room bookings:** a table and a **calendar/timeline view** (rooms × days, drag to move or extend). Statuses: Pending payment, Confirmed, Checked-in, Checked-out, Cancelled, No-show. Assign a physical room number. Walk-in and phone booking quick add. Edit dates or room, add charges (breakfast, room service at GHS 20), record cash/MoMo payments taken at the desk, issue refunds, print or email invoices, and keep guest notes.
3. **Rooms & Rates:** room types (name, code, description, photos, amenities, capacity, beds), **rate variants** (for example Executive at GHS 200 and GHS 250), physical room inventory (room numbers; status: available, occupied, cleaning, maintenance, out of order), seasonal and weekend rates, promo codes, blackout dates, minimum stay, and the cancellation and deposit policy.
4. **Rental orders:** a list and a **calendar view** of every order, with filters by status, date and delivery vs pickup. Statuses: Pending payment, Confirmed, Preparing, Out for delivery, Delivered/Picked up, Returned, Completed, Cancelled. On return, run a **check-in checklist** (quantities returned, damaged or missing items) that automatically works out the deposit deduction and refund. Create orders manually for phone and walk-in customers. Assign a delivery staff member and a vehicle. Generate invoices and receipts.
5. **Rental inventory:** add, edit or archive items (photos, specs, unit price per day, bundle pricing, deposit per unit, total stock, and units out for repair). A **stock-by-date view** shows what's out, what's booked and what's free so items are never double-booked. Low-stock alerts. Delivery zones and fees.
6. **Venues & enquiries:** the event compound and conference room as bookable venues with their own calendar, plus a custom-event enquiry pipeline (New, Quoted, Deposit paid, Done) with a quote builder.
7. **Payments:** all Paystack transactions (rooms and rentals), manual payments, deposits held, refunds, payouts and daily cash-up reports. Export to CSV or Excel.
8. **Content:** edit every page's text and images, gallery (upload, categorise, reorder, alt text required), testimonials, FAQ, coming-soon items (toggle to "Now open"), announcements banner.
9. **Inbox:** contact-form messages and enquiries with assignment, reply and status.
10. **Customers:** guest and rental-customer profiles, booking and order history, a repeat-customer flag, notes.
11. **Reports:** occupancy, average daily rate, revenue per room type, best-selling rental items, utilisation per rental item, and staff activity.
12. **Settings:** phones, emails, WhatsApp, address, check-in/out times, breakfast hours, room-service fee (GHS 20), "Pay at hotel" on or off, payment keys, tax/levy settings, email/SMS/WhatsApp templates.
13. **Notifications:** every new booking, rental order, payment, cancellation or enquiry sends an email plus SMS/WhatsApp to the relevant staff, and the customer gets automatic confirmations and reminders (the day before check-in, delivery or return).

#### ROLES & PERMISSIONS (two roles)
| Capability | **Super Admin** | **Staff** |
|---|---|---|
| Dashboard | Full, including all revenue and reports | Operational view (today's arrivals, departures, deliveries, returns); no revenue totals |
| Room bookings | Full: create, edit, cancel, refund | Create, edit, check in/out, record desk payments; **cannot refund or delete** |
| Rental orders | Full: create, edit, cancel, refund | Create, update status, do return checklists; **cannot refund or delete** |
| Rooms, rates, promos and policies | Full | View only; can change a physical room's status (cleaning, maintenance) |
| Rental inventory | Full: add items, change prices and stock | View; mark units damaged or under repair |
| Payments & reports | Full, plus exports | No access |
| Content (pages, gallery, FAQ) | Full | Edit only if the Super Admin grants the "Content" permission |
| Inbox & customers | Full | Full (reply, assign, add notes) |
| Settings & payment keys | Full | No access |
| Users | Invite, deactivate and reset Staff; set per-staff permission toggles; there is always at least one Super Admin | No access |

- The **Super Admin** can turn individual permissions on or off for each staff member (for example, allow one staff member to edit content or see reports).
- Every action is written to an **audit log** (who, what, when, before/after values). Only the Super Admin can view it.
- Security: email + password with **2FA required for Super Admin**, session timeout, and login history.
- Design the admin so Staff see only what they're allowed to see. Hide items they can't use; don't just show them disabled.

### TECH (suggested)
Next.js (App Router) + TypeScript + Tailwind CSS + Motion (Framer Motion) + Vaul + Sonner. Supabase (Postgres, Auth, Storage) or Payload CMS. Paystack for payments. Resend for email. Deploy to Vercel. Use a seed file with the real rooms, prices and facts above.

### DELIVERABLES
1. A one-page brand sheet (logo lockup with Nyansapo, colours, type and motion tokens).
2. All public pages in desktop and mobile versions, including every state of the room-booking and rental-ordering flows (sold out, payment failed, payment success, manage/track pages).
3. The admin CMS screens listed above, each shown **as the Super Admin sees it and as Staff see it**.
4. A data model covering: room types, rate variants, rooms, bookings, rental items, rental orders, order lines, deliveries, payments, refunds, customers, users, permissions, audit log.
5. A component library (rental cart, quantity stepper, stock badge, order-status tracker, role-aware sidebar, buttons, inputs, date-range picker, key-card, drawer, toast, table, calendar) with interaction states.

### DO NOT
- Use stock-hotel clichés, Inter, purple gradients, generic icons in coloured circles, or centred hero text over a dim photo with two equal buttons.
- Invent amenities (no pool, spa, gym, butler or rooftop terrace).
- Show USD, fake rooms, or booking.com links.


---

### IMAGE MANIFEST (Hotel-A-Wise-Images-web.zip)
Real photos of the hotel. Use them as the site's images and seed data. Do not replace them with stock photos.

| Folder / file | What it shows | Suggested use |
|---|---|---|
| 01-hero-and-exterior/hero-front-desk.jpg | Front desk | Home hero (night version) |
| 01-hero-and-exterior/hotel-view-reception.jpg | Hotel / reception view | Reception and testimonial section |
| 01-hero-and-exterior/contact-hero.jpg | Hotel view | Contact page hero |
| 01-hero-and-exterior/gallery-events-hero.jpg | Event setup | Gallery and Events hero |
| 01-hero-and-exterior/hotel-compound.jpg | Outdoor event compound (100 to 200 guests) | Events and venue booking |
| 02-rooms/standard-room.jpg | Standard Room | Standard room card and detail |
| 02-rooms/executive-room-1.jpg, executive-room-2-customised-sheets.jpg | Executive Room | Executive card and detail |
| 02-rooms/vip-room-1.jpg, vip-room-2.jpg | VIP Room | VIP card and detail |
| 02-rooms/double-bed-room.jpg | Double-Bed Room | Double card and detail |
| 03-bathrooms/standard-, executive-, vip-, vvip-bathroom.jpg | Bathrooms for each tier | Room detail galleries |
| 04-spaces/conference-room-angle-1.jpg, -angle-2.jpg | Second-floor conference room | Conference venue |
| 04-spaces/first-floor-reception-event.jpg, second-floor-reception-event-1/2.jpg | Receptions dressed for events | Events, gallery |
| 04-spaces/first-floor-porch.jpg, second-floor-porch.jpg | Porches for outdoor relaxation | Facilities, gallery |
| 04-spaces/staircase.jpg, spacious-hallway.jpg | Interior | Facilities, gallery |
| 05-services-and-rentals/canopy-rental.jpg, table-rental.jpg, plastic-chair-rental.jpg | Product cut-outs on a light background | Rental catalogue item images |
| 05-services-and-rentals/bed-and-breakfast.jpg | Breakfast dish | Breakfast service |
| 05-services-and-rentals/front-desk.jpg | Illustration (24-hour service) | Optional; prefer the real front-desk photo |
| 05-services-and-rentals/private-events.jpg | Event / cocktail | Private events |
| 06-coming-soon/breakfast.jpg, summer-hut.jpg | Concept images (not yet built) | "Coming soon" cards only, labelled as concepts |
