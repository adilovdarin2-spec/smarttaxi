# Web driver lifecycle QA — 2026-09-05

Scope: the local Docker web at `http://127.0.0.1:5175`, API at
`http://127.0.0.1:4001`, the seeded development driver, and a separate client
registered through the actual local development SMS flow. No production
accounts, SMS senders, payment merchant, or physical GPS trace were used.

## Confirmed defects and changes

- Incoming orders now reconcile through the authenticated incoming/active
  endpoints after region socket events, reconnect, visibility changes and a
  15-second fallback poll. Regional broadcasts cannot assign another driver's
  order to this driver's active trip.
- Failed accept/reject/cancel/no-show responses preserve the current screen
  and order. A successful mutation remains successful even if the following
  profile refresh temporarily fails. An authoritative active order keeps the
  header BUSY even when the profile response is temporarily unavailable.
- Geolocation watching continues while the driver is BUSY. Previously accepting
  an order stopped the watch and cleared the position. Route throttling resets
  when the current trip leg/status changes. Both apps share the identity-scoped
  live-route scheduler, so GPS updates do not discard an in-flight response.
- Completed trips awaiting payment appear separately from active trips, using
  authenticated driver history. The cash confirmation action survives reload;
  final price and driver earnings use the backend's stored amounts.
- Drivers can confirm CASH/KASPI receipts. CARD/MIXED/CASHBACK cannot be marked
  paid by a driver through either API alias. The existing OWNER/FINANCE
  reconciliation and provider/bonus settlement flows are unchanged.
- The road-events response envelope is parsed as `payload.alerts`; previously
  the screen stored the entire object and hid all returned events. The mounted
  guard is reset during effect setup, so React development StrictMode's effect
  replay does not leave road-event requests permanently in loading state.
- One map, scrollable order sheet and fixed five-item navigation fit phone
  widths. Address contrast, road form fields and header controls share the
  blue/white theme. Logout remains reachable at 360px width. On map tabs action
  errors appear over the map without pushing the primary trip action below
  the visible sheet when real route metrics are present.
- The driver car now uses the same original vehicle asset sizing as the
  passenger map. The diagnostic found its loaded 1024px image overflowing a
  40px circular wrapper, leaving a visually empty circle. The driver-only
  marker styles now use a transparent 40px wrapper and contained image;
  address-marker SVGs are unchanged. Browser assertions check actual image
  decoding, asset identity, rendered dimensions, visibility and containment,
  not just the marker wrapper's presence.
- The finish flag's 58px by 76px sizing also existed only in passenger styles.
  Driver-only wrapper, badge and SVG dimensions restore the destination marker
  without changing the approved address SVG. The coordinated MapView update
  fills alternating checker cells, instead of all 16 cells appearing solid
  blue. The browser check samples the actual composited screen to require
  eight visible blue and eight visible white cells above the map.

## Automated browser evidence

`apps/web/tools/smoke-driver-ui.mjs` exercises real local API responses and
real UI actions. Only explicit failure cases intercept a request in that
browser; no successful booking or payment is fabricated.

The completed initial pass verified all five tabs at 390×844 and 360×740;
incoming without reload in 292ms; failed accept, reject, cancellation and
no-show; a retained geolocation watch during BUSY; and the sequence accepted →
going → arrived → waiting → trip → completed → reload → PAID.

Screenshots and machine-readable results are stored in
[`screenshots/2026-09-05-driver-browser`](screenshots/2026-09-05-driver-browser).
The old explicitly authorized QA order
`2b93b802-4722-4320-ac37-b8a6d5ae342f` was completed and paid locally. The first
isolated complete test order was `288de253-6802-4e0a-b8c9-e0d7ed637ac7`; unrelated
orders were left unchanged.

The paired passenger pass initially found that opening `/order` in an
authenticated client session did not restore an existing active order. The
parallel passenger lifecycle work fixed recovery. A real paired pass then
completed order `78cf766c-5c8b-4e4e-a53c-bd9f62b577ab`: passenger search was
restored on opening, each subsequent driver transition reached the matching
passenger screen, and the completed unpaid order recovered after reload on
both sides before cash payment was confirmed. `passenger-*.png` now contain
the actual paired states.

## Checks

- `npm --prefix apps/api test`: passed, including driver manual-payment method
  authorization cases and existing finance/settlement regressions.
- `npm --prefix apps/web run build`: passed before the final combined pass.
- `docker compose up -d --no-deps --build api web`: passed using the shared
  workspace lockfile; readiness reported development, database/Redis/OSRM OK.
- `git diff --check`: passed.

The final combined browser run is recorded in the result file and the
follow-up below. Moving GPS accuracy, spoken navigation and physical Android
layout remain outside this browser test; a running geolocation watch is not
evidence of a real drive.

## Combined lifecycle pass (before explicit GPS fixture)

After the passenger layout and map-overlay corrections, the complete paired
browser suite passed for order `cad6ff37-4ce6-40cc-ae7d-1dcd1a576dfa` and ended
with `PAID`. In addition to the lifecycle checks above, this pass verified:

- Real local road event visible, count updated to one, both action buttons
  reachable at 360px, then the event expired through the UI. Comments remain
  readable and long content does not widen the sheet.
- Successful accept still opens the active trip when profile refresh returns
  503. The error copy has a Russian user-facing translation.
- Logout remains visible at both widths; active primary CTA and navigation
  are within the visible scroll panel/viewport.
- Passenger sheet, driver card, route card, progress rail and call button fit
  both 390px and 360px. Static route/ETA overlays, invented nearby cars/counts
  and a fixed search-duration promise are absent.
- Both passenger and driver recover the completed unpaid order after reload,
  then the driver confirms the actual local cash order and the passenger sees
  the rating state.

The `driver-accepted-live` and `driver-active-360` captures intentionally show
the injected post-accept profile-refresh failure; later transition screenshots
show normal successful states. Search map assets load asynchronously; no
synthetic map imagery is used to conceal loading.

## First paired pass with simulated browser GPS

The first GPS-enabled run passed on the rebuilt local Node 22 web image with order
`303ce3b0-c119-4d15-95a4-2fff378df83e`, ending at `PAID`. The seeded driver is
free again; only this run's own road event and isolated client/order were
created or cleaned up. The follow-up below strengthens its original wrapper-
presence check to verify the actual car image, after visual review found the
driver's empty circle.

This suite explicitly grants browser geolocation permission and supplies a
**simulated browser GPS fixture**, initially latitude `40.8458`, longitude
`68.5041`, accuracy `8`, in the selected local Atakent QA region. The real
driver location API accepted these coordinates with HTTP 200. No successful
location, route, booking or payment response was mocked. This is integration
evidence with a controlled GPS input, not a physical drive or measured GPS
accuracy.

- The new incoming order arrived without reload in 2,336ms. All five tabs,
  390px/360px layout checks, intentional action failures, genuine road-event
  create/expire, paired transitions, reload recovery and payment passed.
- Both driver and passenger received genuine HTTP 200 `to_pickup` routes with
  five geometry points, a visible position marker and rendered blue route
  pixels. Canvas checks mask DOM markers and controls before measuring route
  pixels; a decorative marker alone cannot satisfy them.
- Moving only longitude to `68.5044` after the location throttle sent the new
  coordinates to the real API and rerouted both apps while latitude remained
  unchanged. The driver's backend status was BUSY and its location watcher
  remained active.
- Starting the trip produced genuine `to_dropoff` routes with 13 geometry
  points in both apps. Driver/passenger canvases showed 869/968 route-colored
  pixels with position markers visible; these values are evidence from this
  run, not fixed expected image counts.
- This diagnostic exposed a passenger marker gap before the next socket GPS
  update. The passenger lifecycle fix now uses the route endpoint's actual
  stored driver coordinates only when order ID, driver ID and phase match;
  stale or unrelated route data cannot provide the marker.

## Car-marker and StrictMode development follow-up

The strengthened full paired suite passed with order
`ef2e3641-762a-4e39-aed0-3235d0cb693c`, ending at `PAID`; the seeded driver is
free. This run used the current source in **Vite development mode on the
permitted local origin `http://127.0.0.1:5175`**, with every `VITE_*` define
taken directly from Compose and the existing real Docker API at port 4001.
The API and CORS configuration were not changed. The final compiled run below
replaced this run's output artifacts after checking the same full sequence.

The original image-containment assertion failed before the marker fix:
natural dimensions and rendered dimensions were both 1024px, inside a 40px
wrapper. After the fix, both driver and passenger checks consistently showed
the original loaded 1024px car asset rendered at 40px with `object-fit:
contain`, positive visibility and complete containment in its marker. The
header also remained `Занят` during the deliberately injected profile 503.
All prior lifecycle, GPS, both route-leg, longitude-only movement, real road
event, two-width layout, reload recovery and payment assertions passed.

The final `driver-trip-live-route.png`, `driver-active-360.png` and passenger
route captures were personally inspected. The actual vehicle is now visible
in the driver map instead of an empty circle; address SVG geometry is
unchanged. The error notice, real ETA and primary trip action fit at 360px.

Two attempts to rebuild the latest Docker web image hit external npm network
failures during a cold `npm ci`: `EIDLETIMEOUT` after 629.7s and `ECONNRESET`
after 847.1s. These are **not successful fresh-image builds**. A local
production web build with the exact Compose defines passed after all fixes;
final local serving/recovery is documented in the session continuation.
Physical Android GPS, a moving road journey and spoken turn-by-turn guidance
remain unverified by this browser suite.

## Final compiled nginx QA

After the complete local production build, its output was frozen in the
ignored `tmp-2026-09-05-captures/web-static-verified` directory and served
read-only by the existing nginx image. The local API uses the separately
verified cached hardened Node 22 image. This is the documented local QA
fallback for the cold Docker build's npm network failures, not a claim that
the final images were freshly built successfully. The temporary Vite process
was stopped before restoring the Docker web service.

The car-marker pass used `web-static-verified`; after the finish-marker
follow-up, the combined build was frozen separately as
`tmp-2026-09-05-captures/web-static-final` and mounted read-only in nginx.

The final full paired suite **passed, exit 0**, on that compiled nginx target.
Order `508216b8-ef00-4a17-bd70-0bfae56558ad` reached `PAID`, and the seeded
driver is free. The current `result.json` explicitly records `built-web`,
server `nginx/1.31.5`, web `http://127.0.0.1:5175` and API
`http://127.0.0.1:4001`; `network.json` records the same target and real API
route/location evidence. No Vite development client was present.

The incoming order appeared without reload in 1,351ms. Both decoded car
images were visibly contained at 40px; the accepted-order header stayed BUSY
during the injected profile failure. All five tabs at 390px/360px, genuine
road-event creation/expiration, actual location updates, both routed legs,
longitude-only movement, failure preservation, driver/passenger lifecycle,
unpaid-order recovery after reload and cash confirmation passed again.
For both driver and passenger, the finish SVG measured exactly 58px by 76px,
had positive painted geometry and fit entirely inside the destination-leg
map. The composited image samples each reported eight blue and eight white
checker cells, confirming the flag was actually visible over the map and
buildings. The final driver and passenger 360px route captures were personally
inspected and show the car, route and checkered finish marker together.

The final screenshots are refreshed from this compiled run. Diagnostic
failures are retained separately in the ignored capture directory; they are
not presented as final successful screens. See the session continuation for
the exact local Compose fallback and outstanding external-release blockers.

## Reproduction

Run against a local development stack only. Set `QA_PLAYWRIGHT_PACKAGE` and
`QA_BROWSER_EXECUTABLE` to locally installed Playwright and Chromium/Chrome
when they are not discoverable. `QA_OUTPUT_DIR` selects the artifact folder.
If the seeded driver already has an active order, the script refuses to
change it unless its exact authorized test ID is supplied as
`QA_EXISTING_ORDER_ID`. Normal runs create their own separate client and order.

```text
rtk node apps/web/tools/smoke-driver-ui.mjs
```
