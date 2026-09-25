# Web route visibility and address recovery — 2026-09-05

## Confirmed and fixed

- The tariff map occupied the entire 844px screen while the 508px tariff
  sheet covered its lower portion. Both route markers were below the sheet's
  top edge. The map and sheet now use separate grid rows; the map observes its
  own size and reframes the route when the sheet or viewport changes.
- A failed reverse lookup displayed a disabled “Определяем адрес” button
  forever. It now offers “Выбрать адрес подачи” and explains how to move the
  pin. Clicking the button opens manual pickup search.
- New camera movements, cached positions and out-of-region positions now
  invalidate an earlier reverse lookup. Zooming without moving the centre
  also publishes a settled result, so the loading state can finish.
- Interactive map controls are no longer inside `aria-hidden` wrappers.
- The artificial street SVG overlay was removed. The map shows real vector
  geometry at house-selection scale, without the full-map washout filter.
- Home, address search and tariff typography was lightened to follow the
  user's reference hierarchy. The main action uses the specified primary blue.

## Verification

`apps/web/tools/smoke-client-ui.mjs` passed against local Docker. It verifies
manual recovery after an intentionally failed reverse lookup, zoom recovery,
the real local pickup-to-market route, two supported tariffs, viewport-visible
primary actions and both route markers above the sheet at 390×844 and 360×740.
It creates no orders and uses no production accounts. The normal route uses
real backend data; only the unresolved-address case intercepts its response.

Web production build and Docker web rebuild passed. Browser screenshots are in
`docs/status/screenshots/2026-09-05-web/`:

- `home.png`
- `tariffs.png`
- `tariffs-360.png`
- `address-unresolved.png`

The browser check requires Playwright available to Node. `QA_PLAYWRIGHT_PACKAGE`
can point to an existing package directory, `QA_BROWSER_EXECUTABLE` to an
installed Chrome/Chromium, and `QA_OUTPUT_DIR` to the screenshot directory.
Run `rtk node apps/web/tools/smoke-client-ui.mjs` with those environment values.
`QA_WEB_URL` defaults to the local Docker web port 5175 and rejects non-local
hosts.

The previous QA report incorrectly treated a missing MapTiler key as a web 3D
blocker. The existing renderer already uses OpenFreeMap vector tiles with
building extrusions. That report has been corrected. The outstanding RKA
registry requirement and native driver visual QA remain separate limitations.
