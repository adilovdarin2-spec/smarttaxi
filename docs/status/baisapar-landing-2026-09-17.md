# BaiSapar public website — 2026-09-17

## Scope

User clarified that the public presentation site is separate from the taxi application. The application keeps its existing screens and the refreshed launcher/brand assets from commit 91162b7; no marketing page or new logo was inserted into authentication, ordering or driver workflows.

- Replaced `/` with a responsive blue/white BaiSapar landing page using the new outlined SVG lockup and road monogram.
- Primary “В путь” links open `/order` in the same tab. Driver links open `/driver`; existing authentication remains required.
- Added two illustrated tariff cards, service explanation, driver entry and legal links.
- Removed unsupported promises about pickup time, payment availability and support hours from the old landing.
- Kept all landing styling scoped, with keyboard focus, a skip link, reduced-motion handling, fixed image dimensions and lazy loading below the hero.

## Verification

- Web tests: 188/188 passed, including landing asset existence, internal anchors, brand and `/order` link checks.
- Production web build and map build check passed. Existing large chunk warning remains.
- Actual browser inspection at 1280px, 390px and 360px. Full page checked on desktop and 360px; tariff images checked after scrolling to load lazy assets.
- Confirmed `/order` opens passenger login and `/driver` opens driver login through actual page clicks. No accounts, SMS, bookings or production writes used.
- Narrow layouts: no horizontal document overflow. Browser error log empty during the checks.

## Handoff

This pass changes only `LandingPage.jsx`, `landing.css`, brand regression tests and this record. Android branding was already generated/built in the preceding brand pass; no APK installation was performed here. A push is not proof of Railway deployment; production rendering must be verified separately after deployment.
