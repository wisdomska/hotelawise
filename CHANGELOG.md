# Changelog

All notable changes to this project are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Public site: home, rooms and room pages, gallery, contact, 404, sitemap and structured data.
- Room booking: live availability, 15-minute holds, promo codes, pay in full, deposit or at the hotel; Paystack MoMo and card; confirmation page with calendar file.
- Manage my booking: sign in with a texted or emailed code, change dates or cancel under the 48-hour terms.
- Rentals: reserve and collect, live stock per date range, packs with discounts, pay online or at pickup.
- Venue enquiries for the event compound and conference room.
- Admin foundations: sign-in with two-step for Super Admins, roles and permissions, audit log.
- Rate limits stored in Postgres, Turnstile on public forms, and a password-protected preview site.
- CI: lint, format, typecheck, unit and integration tests with a 90% coverage gate, Playwright e2e with axe and visual checks, and a Worker size check.
