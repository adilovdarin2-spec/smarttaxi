# Whole-app polish/bug round — 2026-07-30 (overnight)

User asked for an open-ended overnight session ("work until morning, every
single thing beautiful/convenient/logical, no lags, no bugs — don't stop to
ask"). Continued a multi-round design-consistency sweep already in progress
this session, then pivoted to two rounds of automated bug-hunting (mobile,
backend, web), then did a live-device deep-dive on the driver navigator
after repeated "still looks terrible" feedback — which turned up what is
very likely the actual root cause: the navigator's persistent cards ignored
dark theme entirely. 15 commits this round.

## Likely root cause of the repeated "looks terrible" feedback

Toggling the app to dark theme and reopening the full-screen Navigator
(`8400b95`, `bd66040`) showed three of its persistent on-screen cards
rendering as bright white/cream boxes floating on an inverted dark map:
the speed/speed-limit cockpit (`_NavigatorMetric`), the "До точки посадки"
distance strip (`_NavTargetStrip`), and the "tap map to select alert point"
banner on the road-alert reporting map (`_RoadAlertMap`). All three used
hardcoded `SmartTaxiColors`/`Colors.white` with zero `context.palette`
usage, despite their parent screens already being fully dark-theme-reactive
(dark map tiles, dark Scaffold background) — a genuine "half-converted
screen" gap, not a deliberate design choice. (There IS a deliberate,
correctly-documented exception for small transient map badges/chips like
`_DriverMapBadge` and `_RoadAlertMapFallback` — confirmed via project
memory + git history before touching anything, and left untouched.) Fixed
all three to use `context.palette`; confirmed live on-device in dark mode
that the cockpit and distance strip now read as one cohesive dark UI
instead of two glaring white boxes. If the user (or whoever they were
demoing to) had dark theme active, this alone would fully explain
"navigator still looks terrible" surviving several earlier rounds of
light-mode-only visual fixes.

## "Wall of boxes" visual sweep (mobile)

Recurring anti-pattern: multiple sibling widgets each carrying their own
border/shadow, stacked or side-by-side, instead of one shared card with thin
dividers between rows. Fixed:

- Driver trip stepper (`58600a3`) — redesigned from six individually-bordered
  boxes to the passenger app's connected-dot+line style; also fixed a label
  truncation regression from the redesign (6 steps vs. passenger's 4 needs
  `FittedBox`, not a fixed font size).
- Driver + passenger wallet screens (`e76bc42`) — topup/payout/transaction/
  card list rows consolidated into one card per section with hairline
  dividers.
- Passenger notifications (`b0881fc`) — one card per day-group instead of a
  stack of separately-boxed tiles; unread state stays on the existing gold
  dot rather than a stronger border.
- Driver road-alerts nearby list (`58ba694`) — removed a redundant outer
  `PremiumCard` that double-boxed an already-boxed alert-row list.
- (Also confirmed already done earlier this session, before this round:
  FAQ screens both sides, legal-document hub, driver application-documents
  list — all consolidated the same way.)

## Race-condition bugs (setState after dispose)

Two automated audits (mobile, then web) specifically hunting the "component
disposed while an awaited request is in flight, then setState fires anyway"
bug class:

- Passenger `_cancelOrder`, `_refreshPreview`, `_applyMapTap` (`b79ea12`) —
  each had at least one `setState` after an `await` with no `mounted` check.
- Driver `_useGps()` in the road-alerts sheet (`be0f0a5`) — same gap on the
  location-service/permission-check path (a system permission dialog can
  outlive the sheet if the user dismisses it mid-flow).
- Backend `/health` and `/health/ready` (`b4bf5a9`) — `buildMapsDiagnostics()`
  had no try/catch unlike the db/redis checks right above it; a throw (e.g.
  `redis.isOpen` on a disconnected client) would hang the request forever
  instead of returning a degraded status. No process-crash risk (there's a
  top-level `unhandledRejection` handler), but a hung readiness probe can
  still get an instance marked unhealthy by a deploy platform.
- Web admin `DriverDetailPanel`/`ApplicationPanel` document-loading, and
  `DriversLiveMapSection`'s 15s poll (`37cc26d`) — modal-churn (clicking
  through drivers/applications quickly) or list/map view toggling could
  call `setState` after unmount. Client `ReferralSection`'s copy-toast
  timeout wasn't cleared either (low risk, same commit).

## Navigator deep-dive (driver full-screen navigator)

User's complaint was specifically and repeatedly about the navigator. Live
on-device inspection (not just code reading) found two real, fixable
defects, plus caught and fixed a regression introduced while fixing one of
them:

- **Pickup-marker icon** (`8244e57`) — used `Icons.navigation_rounded` (an
  arrow) instead of the app-wide pickup convention
  (`Icons.radio_button_checked_rounded`, enforced by an existing test on
  `route_fields.dart`). An arrow reads as a heading/compass indicator, and
  sits directly next to the driver's own position marker once close to the
  pickup point — exactly what a screenshot showed, initially mistaken for a
  duplicate self-position marker before tracing it to the pickup pin.
- **Speed-card empty space** (`8244e57`) — the "Скорость" card is alone in
  its Row whenever there's no posted speed limit (confirmed: no OSM
  `maxspeed` data for these regions), so `Expanded(flex: 3)` stretched it
  across the full row width, leaving the number in a large empty void.
- **Self-inflicted layout regression, caught before commit**: first attempt
  at the speed-card fix made the metric a bare (non-`Expanded`) `Row` child
  when alone, which broke the whole bottom-zone `Positioned`'s
  `bottom: bottomInset + 14` anchoring — it rendered pinned near the *top*
  of the screen, overlapping the status bar, on every build. Root cause not
  fully isolated (insets logged correctly via a temporary debug print;
  reverting the Row change immediately fixed the position, confirmed via a
  clean A/B rebuild-and-screenshot test), so the safer fix keeps the Row's
  `Expanded` structure unchanged and instead wraps the metric in
  `Align` + `IntrinsicWidth` to get the same "don't stretch when alone"
  visual result without touching the Row's shape.

## Verification

- `flutter analyze`: clean after every change. `flutter test`: 35/35 (one
  test needed updating — it asserted `Icons.navigation_rounded` as a proxy
  for "icon-based marker, not a letter label"; updated to the new icon).
- Every fix rebuilt, installed on-device (debug APK, physical device), and
  visually re-verified via screenshot — including a clean cold-restart
  reproduction of the layout regression before and after the fix, to rule
  out stale-state artifacts.
- `apps/api`: `node src/tools/syntax-check.js` clean (no live DB in this
  environment to run the full `npm test` check suite).
- `apps/web`: `npm run build` (vite) clean. Noted, not fixed: the three
  panels (admin/client/driver) still bundle into one ~1.58MB JS chunk with
  no code-splitting — a real future perf opportunity, out of scope for a
  bug-fix round.

## Other small fixes

- Passenger driver-contact card (`8400b95`) — same "lone `Expanded` stretches
  across the full row" pattern as the speed-card fix: when a driver record
  has no phone number but the trip is still cancellable, the cancel button
  was the row's only child and stretched across the full card width with a
  large empty void on both sides. Fixed with the same `Align`+`IntrinsicWidth`
  approach (Row's `Expanded` structure kept unchanged, per the lesson above).

## Web panels — same "wall of boxes" pattern found, deliberately not fixed

Dispatched one more audit against the three React panels (admin/client/
driver) for the same visual anti-pattern fixed all night on mobile. Real
instances found: the admin Dashboard's "Что требует внимания" problem list
(`.admin-problem-item`, highest-traffic screen), the driver home tab's
`EarningsStrip`/`driver-core-money-grid` stat boxes, and the admin Quality
page's reviews list (which already has a proven divided-row alternative
elsewhere in the same file, `.admin-table-row`, that the reviews list
doesn't use).

**Deliberately not fixed this round**, for two compounding reasons:
1. The problem-list items use per-severity border/background tint
   (warning/danger/success) to convey real triage information, not pure
   decoration — collapsing them into one shared card risks losing that
   signal unless replaced with an equivalent cue (e.g. a colored left accent
   bar), which needs live visual confirmation to get right, not a blind
   guess.
2. `.driver-core-stats div`'s actual styling comes from one shared CSS
   selector list spanning ~20 unrelated component classes across multiple
   theme-state blocks (`!important` overrides) — not the small, isolated
   rule it first looked like. Changing it safely means either touching that
   shared list in several places or forking a new rule, and I have no way
   to visually verify the result here: the local backend is confirmed
   broken (Docker hangs, no working Postgres/Redis — see project memory),
   and previewing against the real admin/driver panel needs real
   credentials against a live backend that this session doesn't have.

Given the user's actual complaints tonight were entirely about the mobile
app, and per this project's own stated preference (stop at static
verification rather than force a risky change when live testing is
blocked), left these as documented findings rather than unverified CSS
edits. Worth a dedicated round with either local backend access restored
or real staging credentials.

## Not done / known limitations

- Navigator road-sign/camera data is only as complete as OpenStreetMap's
  coverage for these regions — already reported earlier this session as a
  data-availability limit, not a code bug.
- The Flutter-side root cause of *why* a bare Row child broke `Positioned`'s
  bottom-anchoring wasn't fully isolated (no exception, no RenderFlex
  overflow logged) — worked around structurally instead of chasing the
  underlying Flutter layout mechanism further, given the fix verified clean
  via direct A/B testing.
