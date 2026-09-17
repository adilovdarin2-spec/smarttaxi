# Web address picker and trip recovery — 2026-09-05

Local development web/API only; no production accounts or transactions.

## Confirmed UI defects

The address picker had a draggable map but no way to confirm it whenever
popular places existed. It now offers explicit map/search modes, keeping the
address and confirmation visible at 390×844 and 360×740. Long address text
wraps in map mode. Unresolved and out-of-region points stay disabled.

The marker inherited two CSS translations: its tip was horizontally offset,
and the API received the camera centre below the visible tip. The wrapper now
uses one bottom-centre anchor without changing the approved SVG geometry.
MapLibre unprojects the actual tip for reverse geocoding; tapping a new point
places it under that tip using the camera offset.

Map motion invalidates earlier reverse requests before cached-result returns
as well as network responses. The recovery timer waits for camera motion to
end, and the cache is scoped to the selected region.

Changing the region previously changed its tab/label without moving the map.
An explicit region or GPS centre now moves beneath the same visible pin;
passive reverse-geocoder results do not recenter the camera in a feedback loop.

The home screen also rendered an old decorative pickup badge alongside the
real geographic picker. That duplicate was visually confirmed and removed.
Only the approved marker remains, positioned within the cropped visible map;
the smoke test rejects a reintroduced decorative duplicate.

## Active trip recovery

Authenticated login/reload restores the server's current trip, including
completed but unpaid orders. Real driver-location events update both latitude
and longitude. One shared route scheduler for rider and driver refreshes new
legs immediately and guarantees a trailing movement refresh; stale responses
cannot restore cancelled routes or cross account boundaries.

Passenger lifecycle sheets and driver cards fit both tested widths. Decorative
cars, fixed nearby counts, fixed search promises and static route/ETA images
were removed; the map uses actual API geometry and markers. See
`web-driver-lifecycle-2026-09-05.md` for the paired lifecycle evidence and the
distinction between browser GPS fixtures and a physical drive.

## Regression checks

- `npm --prefix apps/web test`: 16 scheduling/recovery/location tests plus
  the alternating checkered-finish marker regression pass (17 total);
  this suite is now included in CI, as are operations-helper regression tests.
- `apps/web/tools/smoke-client-ui.mjs`: real local address/map/tariff preview,
  two tariffs, 390/360 visible actions/markers, centred pin, explicit map mode,
  unresolved address rejection, delayed response during a held map drag and
  switching Atakent → Myrzakent → Atakent with actual geographic requests.
  The payment sheet is opened separately; this does not exercise an external
  payment merchant. Failed browser runs retain diagnostic captures in the OS
  temporary directory instead of overwriting release evidence.
- A normal web production build passes. Paired driver/passenger browser
  tests cover current-trip recovery, transitions and cash payment separately.

The final preview smoke passed against nginx on port 5175 serving the frozen
production build, and before that against the same source under Vite. See
`SESSION-2026-09-05-CONTINUATION.md` for the temporary local runtime override
and the separate npm registry blocker on clean root-context image builds.

Final captures are under `screenshots/2026-09-05-web/`: `address-map.png`,
`address-map-360.png`, `address-map-unresolved.png`, `home.png`, `tariffs.png`,
`tariffs-360.png` and `payment.png`. `address-map-before.png` records the original missing
map-confirmation action. These are web screenshots, not Android screenshots.

The phone remains connected but Android rejected local APK installation with
`INSTALL_FAILED_USER_RESTRICTED`. Debug APK build succeeded with localhost
API/socket/web defines, and USB reverse ports 4001/5175 are configured.
Physical flow, moving GPS, spoken navigation and native driver route layering
remain unverified until device-side installation approval.
