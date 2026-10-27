# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Home: the booking bar sits across the bottom edge of the hero, half over the photo, so more of the photo shows.
- Turnstile runs invisibly; no "Verify you are human" box appears anywhere.
- Admin: the top search reads "Search" on small screens; New booking no longer asks for a password.
- The home title sits on two balanced lines in title case, with real spaces between words for screen readers.
- Page intros and captions always sit beneath their headings (rooms, gallery, rentals, venues, booking).
- A branded error page replaces Next.js's default; a tab left open across a deploy reloads itself.
- Releases are tagged and published by a workflow when the version changes on main.

## [1.0.0] - 2026-10-27

First production release, live at https://hotelawise.wisdomska.workers.dev.

### Added

- Public site: home, rooms and room pages, gallery, contact, 404, sitemap and structured data.
- Room booking: live availability, 15-minute holds, promo codes, pay in full, deposit or at the hotel; Paystack MoMo and card; confirmation page with calendar file.
- Manage my booking: sign in with a texted or emailed code, change dates or cancel under the 48-hour terms.
- Rentals: reserve and collect, live stock per date range, packs with discounts, pay online or at pickup.
- Venue enquiries for the event compound and conference room.
- Admin foundations: sign-in with optional two-step, roles and permissions, audit log.
- Rate limits stored in Postgres and Turnstile on public forms. The preview is open but never indexed.
- CI: lint, format, typecheck, unit and integration tests with a 90% coverage gate, Playwright e2e with axe and visual checks, and a Worker size check.
- Admin: all 14 screens on real data: dashboard, room bookings (list and drag-to-move calendar), rooms & rates (room board, room types, rate rules, promo codes, blocked dates, policies, add/retype/remove rooms), rental orders, inventory with photo uploads, venues pipeline and quotes, payments and refunds, customers, inbox, content, settings, reports, users & permissions, audit log, my account.
- Desk work: walk-in and phone bookings, check-in and check-out, payments at the desk, refunds and approvals, return checklists with deposit deductions.
- Scheduled jobs: day-before reminders (check-in, pickup, return), release of unpaid pay-at-pickup orders at 10:00, nightly housekeeping.
- Guest messages for desk bookings and every rental step; PDF receipts and invoices for guests and staff; Excel and CSV exports.
- Admin dark theme in night navy (a darker take on the brand blue) instead of neutral grey.
- Accessibility: skip links, focus kept inside dialogs, drawers and search and returned on close; axe, keyboard, reflow and text-spacing tests across the site and every admin screen in both themes.

### Security

- Content-Security-Policy with per-request nonces on the admin and checkout; HSTS, no framing.
- Money and account actions always re-ask for the password, with an attempt limit.
- Public forms can no longer change an existing customer's email (it could have redirected manage-booking codes).
- Refunds lock the booking or order, so concurrent refunds can't exceed what was paid.
- The admin idle sign-out is enforced on the server.

### Fixed

- On the deployed site, pages inside route groups didn't load their scripts in some browsers (redirect loop on bracketed paths).
- Tooltips stay inside the window everywhere; collapsed-sidebar tooltips open to the right.
- Cron jobs now run inside the app, so they can reach the database and settings.
- Text-field outlines meet 3:1 contrast (WCAG 1.4.11) on the site and the admin.
- Screen-reader names now start with the visible label (sidebar, room board, calendar bars, photo cells; WCAG 2.5.3).
- Overlapping calendar bars stay readable; hidden table headers no longer widen the page on phones.
- Workers renamed `hotelawise` and `hotelawise-preview`; one Cron Trigger per Worker to fit the free plan.
- Public site: the home hero fills the screen with its content on the bottom edge; the rooms strip is a
  carousel on phones; room filters fold behind a Filters button on phones; the comparison table shows
  it scrolls without a scrollbar; headings run the full width; the floating "Book a room" is phone-only.
- Admin: text fields and dropdowns share one 40px height; table rows centre their content; FAQ,
  testimonial and gallery reordering shows at once; gallery Live/Hidden tags read on any photo; the
  calendars jump to any month and year.
