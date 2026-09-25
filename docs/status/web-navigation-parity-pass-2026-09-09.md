# Web driver navigation — 9 September 2026

## Delivered scope

The web driver now has a dedicated navigation screen for accepted orders,
driving to pickup, and driving to the destination. Previously these states
offered only the general driver map/card. This closes that particular parity
gap; it does not certify complete web/Flutter parity or superiority to other apps.

- Blue/white layout with a large real maneuver, road name, remaining road
  distance, estimated arrival, current sensor speed and the current trip action.
- Camera follows the vehicle at navigation scale and rotates using valid moving
  GPS heading. Manual map dragging/zooming suspends following; recenter restores it.
  The vehicle uses the existing original asset and is 32 CSS px in navigation.
- Road-distance projection mirrors Flutter's `navigation_progress.dart`:
  no straight-line shortcuts, no invented turns from polyline bends, ordered
  maneuver anchors, and correct final arrival on routes with repeated coordinates.
- Guidance requires a real sensor timestamp no older than 12 seconds and
  accuracy of 60 m or better; points more than 60 m from the route do not produce
  old turn instructions. Missing speed is not displayed as zero.
- Browser GPS writes are serialized at a 4-second interval, with stale queued
  fixes dropped. Navigation requests actual new fixes while foregrounded;
  timers never manufacture sensor timestamps. A late polling error cannot
  overwrite a newer watch fix. Server-backed routing still uses acknowledged GPS.
- Route failures are distinct from loading, retry through the existing bounded
  scheduler, and preserve a previously confirmed path with a visible warning.
  Late failures cannot attach to a different order/driver/leg or disposed screen.
- Return leaves the order intact. Arrival/completion return to the active-order
  panel. No authentication or state-machine transition is bypassed.
- Confirmed visual bug fixed: arrival/waiting panels no longer show obsolete
  driving-to-pickup ETA. Fallback or invalid totals cannot become a driving ETA.
- At 320×568 the trip action remains a separate visible row. Long addresses may
  scroll inside the information area. GPS loss uses explanatory text instead of
  three empty metrics, keeping the GPS recovery button visible.

## Validation and evidence

Only local Docker development was used: API `127.0.0.1:4001`, web
`127.0.0.1:5175`. Readiness confirmed `env=development`, `status=ok` before
test mutations and at final verification. Existing volumes were preserved.

Local seeded driver `+77000000000` and client `+77000000001` were used through
normal password authentication. The single new QA order was
`09342f4f-b06d-40c7-a584-d7d48b31fe75`, explicitly marked as local QA/no real trip.
Client creation used the development API with real address search/route/quote.
All driver actions used the built nginx web UI:

`ONLINE → accept → navigator → return → navigator → going → arrived → waiting
→ start trip → navigator to destination → complete → cash confirmation`.

Client history subsequently confirmed `PAID`. This is a test-only cash-state
transition, **not a real transfer or merchant integration**. Driver was restored
to `OFFLINE`; other orders were not accepted or deleted. Reload restored the
active order during QA. Earlier intermittent no-op browser inputs were not
reproduced after rebuilding/reloading; the above transitions were then observed.

The desktop browser denied geolocation. The real-order screenshots therefore
prove permission feedback, target/phase and trip actions, **not physical GPS
guidance**. For responsive navigation rendering, `tools/navigator-preview.html`
uses the production component/map with real OSRM geometry and explicitly
synthetic GPS. Its visible banner labels this distinction. It makes no account
or order mutations and is not imported into the production bundle.

Evidence directory: [web-navigator-2026-09-09](evidence/web-navigator-2026-09-09).

- `qa-navigation-390.png`, `qa-navigation-320.png`: real OSRM route, synthetic GPS.
- `qa-gps-stale-320.png`: suppressed stale guidance and visible recovery action.
- `qa-route-fallback-320.png`: no fabricated straight-line road guidance.
- `qa-route-error-320.png`: explicit network/provider failure and automatic retry.
- `local-order-gps-denied.png`, `local-order-dropoff.png`: built application and
  real local order before the final compact missing-GPS presentation adjustment.

The component and geometry checks cover 390×844 / 320×568, manual pan/recenter,
GPS recovery, fallback and network-error presentation. They are not on-road tests.
The full order cycle preceded the final ETA/error-message/compact-GPS changes;
those later changes received regression/SSR tests and fresh preview visual QA.
The final nginx build was reloaded and restored the offline driver screen with
no captured browser errors. The temporary port-5176 preview server was stopped,
its tab closed and the responsive viewport override reset after QA.

Commands (all via `rtk proxy`):

- `npm --prefix apps/web test`: **72/72 passed**.
- `npm --prefix apps/web run build`: passed; existing large MapLibre chunk warning.
- `docker compose config -q`: passed.
- `docker compose up -d --build`: rebuilt local API/web without volume removal.
- `git diff --check`: passed.

API implementation, database schemas and Flutter code were not changed in this
pass; their full test suites and APK build were not rerun for these web changes.

To reproduce the isolated preview from the repository root:

```powershell
rtk proxy npm --prefix apps/web run dev -- --host 127.0.0.1 --port 5176 --strictPort
```

Open `/tools/navigator-preview.html?state=live` on that server. Available states:
`live`, `stale`, `fallback`, `off-route`, `route-error`, `action-error`.
The real OSRM service must be reachable; fixtures are not a routing SLA test.

## Changed files

- `apps/web/src/features/driver/`: `DriverApp.jsx`, new `DriverNavigator.jsx`,
  `driverNavigator.css`, `navigationProgress.js`, `driverRoutePresentation.js`,
  `driverLocationPublisher.js`, `driverLocationFeedback.js`.
- `apps/web/src/features/map/MapView.jsx`: opt-in following/heading behavior;
  passenger map behavior and layer ordering retain their defaults.
- `apps/web/src/features/client/`: `clientTripLifecycle.js`,
  `useLiveDriverRoute.js` expose context-bound failure feedback without changing
  the existing route-only consumer interface or retry cadence.
- Web regression tests and the explicitly labeled development preview; this
  report, customer-handoff pointer and evidence images.

## Still not certified / external constraints

- Physical road navigation, voice/TTS, background GPS and battery behavior need
  target-device tests. Web does not gain native background navigation guarantees.
- Web driver is currently Russian; full locale/dark-theme acceptance and every
  screen/device combination are not certified by this pass.
- No live traffic feed: ETA is approximate, and minimum provider duration is
  not a guarantee of the fastest route under current traffic. Production map/
  routing capacity and provider agreements remain unresolved.
- Actual building/address data are unchanged; missing official regional
  `rka,label,lat,lng` plus checksummed `meta.json` remain external blockers.
- No SMS sender, merchant, legal/store or production deployment actions were
  performed. Latest Android APK still requires the previously documented user
  installation confirmation and physical QA; this web stage does not install it.
