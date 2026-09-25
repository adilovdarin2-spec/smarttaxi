# Stage 10 Client QA

Stage 10 is a cleanup and regression pass for the SmartTaxi client MVP. It does not add driver, admin, Road Assistant, or new payment functionality.

## Scope

- Auth / login / registration visual regression check.
- Main client map screen.
- Address search and map address selection surface.
- Route preview, tariff selector, payment selector, and order CTA.
- Searching Driver screen.
- Driver Found / active ride statuses through backend lifecycle.
- Driver arrived / waiting / trip started / trip completed.
- Paid / rating / rated success.
- Trip Details modal.
- Secondary client panels: Profile, Settings, Support, FAQ, About.

## Manual QA Checklist

- PASS: Auth screen was opened after logout and checked at 390px width with no horizontal overflow.
- PASS: Existing user login was tested with the local seeded client account.
- PASS: Main map screen was checked at 390x844, 360x800, and 430x932.
- PASS: Main map screen kept the map visible and did not expose the region list as a visible permanent panel.
- PASS: Destination address picker opened from `Куда едем?`.
- PASS: Local address search was tested with `bazar`; it returned Atakent bazar results first, then nearby-region matches.
- PASS: Route state showed tariffs, backend price, payment method, and order CTA only after destination selection.
- PASS: Order was created through the UI and reached `SEARCHING_DRIVER`.
- PASS: The live order was progressed through backend endpoints:
  `DRIVER_FOUND`, `DRIVER_GOING_TO_CLIENT`, `DRIVER_ARRIVED`, `WAITING_CLIENT`, `TRIP_STARTED`, `TRIP_COMPLETED`, `PAID`.
- PASS: Paid/rating UI appeared after backend `PAID`.
- PASS: Rating was submitted through the UI and the client screen reached `RATED`.
- PASS: Trip Details opened and closed without horizontal overflow.
- PASS: New Trip returned to the main client screen after `RATED`.
- PASS: Browser console was checked for app errors during the visual pass.

## Screenshots

Screenshots were saved locally in `qa_screenshots/`:

- `stage10_auth_390.png`
- `stage10_main_390.png`
- `stage10_route_390.png`
- `stage10_searching_390.png`
- `stage10_paid_390.png`
- `stage10_rated_390.png`
- `stage10_trip_details_390.png`
- `stage10_settings_390.png`
- `stage10_main_360_after_css.png`
- `stage10_main_430.png`

The screenshots are QA artifacts and are not required for runtime.

## Cleanup Done

- Fixed remaining mojibake strings in the client UI secondary panels and fallbacks.
- Removed mojibake aliases from client region/tariff helpers.
- Fixed passenger fallback strings for region, rider name, and local tariff fallback.
- Added Latin/translit tags to the local client address catalog so common local searches like `bazar`, `rynok`, `center`, `school`, `apteka`, and similar terms return useful local results.
- Tightened the recent-address section spacing on narrow mobile width so the `Все` action and address cards do not sit against the viewport edge.

## Commands Run

Run from repository root unless noted:

```bash
npm run syntax
npm run check
npm test
npm --prefix apps/web run build
npm --prefix apps/web run syntax
npm --prefix apps/web run check
API_URL=http://127.0.0.1:4000 npm --prefix apps/api run smoke:stage2
API_URL=http://127.0.0.1:4000 npm --prefix apps/api run smoke:stage3
API_URL=http://127.0.0.1:4000 npm --prefix apps/api run smoke:stage9
git diff --check
```

## Known Mocks / Risks

- SMS verification still uses the local development `devCode` path.
- Address coverage is a local catalog plus backend geocoder/provider fallback, not a complete production Kazakhstan house-level dataset.
- Browser automation could not reliably type Cyrillic through the test driver, so the Stage 10 typed search check used translit `bazar`; Cyrillic search should still be included in manual device QA with a real keyboard.
- Local OSM tile/geocoder behavior depends on network/provider availability.
- Hidden region/menu DOM text can appear in broad `innerText` reads; visual DOM and screenshots show it is not visible as a permanent region list on the main screen.
