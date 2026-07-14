# Routing overnight — 2026-07-15 (apps/api/src/modules/routing + apps/web map/track)

Autonomous backend+web session covering route accuracy/reliability, live
route recalculation while a driver is moving, and matching map/units
behavior between the driver panel and the client-facing map/track pages.
Scope was `apps/api/src/modules/routing/**` and `apps/web` (map + client +
driver + track screens) only — `apps/mobile/smarttaxi_app` was not touched
(another parallel session owns the navigator there). Committed in small,
per-area commits on `dev`, no `git add -A`, no force-push/reset/clean.

---

## 1. Fallback when the routing provider is unavailable

`requestRoute()` (OSRM) is unchanged in one important way on purpose:
`buildRoutePreview` (the pricing-facing route used at order creation) still
**fails hard** with `503 ROUTE_UNAVAILABLE` when OSRM is down or
unconfigured — a trip's billed distance must never be silently guessed.
This is also locked in by an existing test
(`routing-location-check.js`: "routing provider failure returns
ROUTE_UNAVAILABLE").

What changed:
- `requestRoute` now caches a short-lived (20s) "provider is down" marker in
  Redis after a failure, so repeated live-route polls (every ~8s from the
  driver/client apps) fail fast instead of each waiting out a fresh 10s
  OSRM timeout while an outage is ongoing.
- New `buildActiveLegRoute` / `requestRouteWithFallback`: used **only** by
  the *live tracking* routes (driver-to-pickup/dropoff, and the new public
  trip-tracking route below) — when OSRM is unreachable, these fall back to
  a straight-line estimate (great-circle distance × 1.3 road-distance
  factor, 28 km/h assumed average speed) instead of going blank. The
  response is explicitly marked `fallback: true`, `providerStatus:
  "Fallback"` so a client could surface "приблизительно" if desired (not
  wired into any UI copy yet — kept minimal).
- `resolveActiveLeg(order)` was extracted from `buildDriverToPickupRoute` so
  the same pickup-vs-dropoff phase logic is shared with the public track
  route instead of duplicated.

## 2. Live route recalculation while the driver is moving

`buildDriverToPickupRoute` already recomputed from the driver's latest
`driver_locations` row and picked pickup-vs-dropoff from the order's
current status — that part was correct going in. What was missing was the
client actually *asking* for it:

- **Driver panel** (`apps/web/src/features/driver/DriverApp.jsx`): already
  re-fetched this route every ~8s from a prior session's work — untouched
  except for one rounding fix (see §4).
- **Client app** (`apps/web/src/features/client/ClientApp.jsx`): previously
  never called `driver-to-pickup` at all — the map/ETA stayed frozen on the
  original pickup→dropoff price-preview route for the entire trip. Added a
  `liveRoute` state + effect (same ~8s throttle, keyed on
  `order.id`/`order.status`/`order.driver_lat`) that fetches the real
  driver→target leg once a driver is assigned, and an `activeRoute =
  liveRoute || route` used in the driver-found and in-trip map cards (the
  pre-acceptance "searching" and "cancelled" screens keep the static
  pickup→dropoff `route`, which is correct there — no driver yet).
- **Public trip tracking** (`GET /api/orders/track/:token`): previously
  returned only status text and driver lat/lng — no pickup/dropoff
  coordinates and no route, so `TrackApp.jsx` (`apps/web`) never rendered a
  map at all. Added `pickupLat/Lng`, `dropoffLat/Lng` to the response
  (safe: no phone numbers, no price, no rider identity — matches the
  existing comment's privacy bar) plus a server-computed `route` for the
  active leg (via `buildActiveLegRoute`, same fallback as above). `TrackApp`
  now renders `MapView` with pickup/dropoff/driver markers and the live
  route line, still polling every 5s as before.

## 3. Smooth driver marker, redrawn route line

`apps/web/src/features/map/MapView.jsx` used to tear down and recreate
**every** marker (pickup, destination, driver) on every position update —
the driver icon visibly jumped between GPS ticks because a freshly created
marker has no prior position to animate from. Refactored to keep one
persistent `maplibregl.Marker` instance per role (pickup/destination/
center/driver), updating position in place; the driver marker now tweens
between its old and new lat/lng over ~900ms (`requestAnimationFrame`,
ease-out) instead of teleporting. The route polyline redraw (via
`map.getSource("smarttaxi-route").setData(...)`) was already correct and
untouched — it already updates whenever the `route` prop changes, which
now happens live via §2.

## 4. Units/rounding consistency

Distance was already consistent everywhere (`(meters/1000).toFixed(1)` →
one decimal km). Duration wasn't: `ClientApp`'s
`durationMinFromRoute`/pricing (`order-pricing.service.js`) round **up**
(`Math.ceil`) so a trip is never under-priced/under-timed, but the driver
panel's live-route ETA badge rounded to nearest (`Math.round`), so the same
route could show a different minute count in the driver app vs the client
app. Changed the driver panel's badge to `Math.ceil` to match the one
convention used everywhere else.

## 5. Tests / smoke-check

Extended the existing `apps/api/src/tools/routing-location-check.js`
(no separate new file needed — routing already had one) with:
- `buildDriverToPickupRoute` falls back to a straight-line estimate
  (`fallback: true`, `providerStatus: "Fallback"`) when the provider fetch
  throws, while still resolving the correct pickup/dropoff phase.
- `buildActiveLegRoute` (the function shared with the public track route)
  resolves the dropoff leg directly and uses the real provider route when
  it succeeds.
- `resolveActiveLeg` throws `ORDER_NOT_ACTIVE` for an order with no active
  driving leg (unit-level, without going through the full route-building
  call).

Ran and passing: `npm run syntax`, `npm run check` (all `apps/api/src/tools`
checks except one unrelated pre-existing failure — see "Known gaps"),
`node src/tools/routing-location-check.js` directly, and `npm run check`
(`vite build`) in `apps/web`.

## 6. Live browser verification (apps/web)

Started this session's own dev server (`smarttaxi-web-panels`, port 5173)
since another chat's server was already running and not reachable from this
session's Browser pane. Verified:
- Client home screen (`/`) mounts `MapView` with the new persistent-marker
  code with zero console errors.
- `/track/:token` (`TrackApp`) mounts and gracefully shows a "Failed to
  fetch" message (expected — no backend reachable in this environment, see
  `reference_local_backend_env` memory) instead of crashing; the map is
  correctly not rendered when there's no trip data yet.
- No JS console errors on any of the above.

**Not verified live**: actual marker animation/tween and route-line redraw
with real moving-driver data, or a full logged-in driver/client walkthrough
— this environment has no reachable backend/database (Docker never came up,
native Postgres password unknown, per `reference_local_backend_env`
memory), and the sandboxed browser's maplibre tile/style requests didn't
appear to reach the network either (map stayed on "Загружаем карту...").
Verified the marker/route logic by code review plus the fact that mounting
it (with `mapReady` gating the marker-sync effect) threw no console errors.

## Known gaps / follow-ups

- `npm run check` in `apps/api` has one **pre-existing, unrelated** failure:
  `Admin shell missing honest state copy: Пока нет обращений` — this checks
  `apps/web/src/features/admin/AdminApp.jsx` support-panel copy, which this
  session never touched (`git status` confirms no changes to that file).
  Left alone per the parallel-sessions convention — likely another
  session's in-progress edit.
- `apps/web/src/features/track/TrackApp.jsx` was already untracked
  (`git log` shows zero history for it) before this session — a prior
  session created it but never committed. It's included as a new file in
  this session's commit since this session substantially rewrote it.
- The straight-line fallback's constants (1.3× road-distance factor, 28
  km/h average speed) are reasonable defaults for these small-town/rural
  service regions but not empirically tuned — fine as a degraded-mode
  estimate, not meant to be precise.
- Fallback routes aren't surfaced distinctly in any UI copy yet (no
  "приблизительно" badge) — the data (`fallback: true`) is there if a
  future session wants to add one.
