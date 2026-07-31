# Whole-app polish/bug round — 2026-07-30 (overnight)

User asked for an open-ended overnight session ("work until morning, every
single thing beautiful/convenient/logical, no lags, no bugs — don't stop to
ask"). Continued a multi-round design-consistency sweep already in progress
this session, then pivoted to two rounds of automated bug-hunting (mobile,
backend, web), then did a live-device deep-dive on the driver navigator
after repeated "still looks terrible" feedback — which turned up what is
very likely the actual root cause: the navigator's persistent cards ignored
dark theme entirely. Also ran a targeted lag-pattern audit given the user's
explicit "no lags" ask, and fixed the one real finding. Later, after finding
one panel (driver web) missed by the original mounted-component audit,
followed the same suspicion into the largest remaining file (admin web) and
found 8 more real instances of the same bug, then the same check on the
third and final panel (client web) found 7 more. Finally, a dedicated
audit of backend money-handling for race conditions found the code
already solid, with one defensive hardening applied. 22 commits this
round.

## Backend money-handling concurrency audit

Given this platform moves real money (fares, driver payouts, commission,
client top-ups, promo discounts), ran a focused audit of wallet balance
updates, order-payment status transitions, promo code usage-limit
enforcement, and driver debt adjustments for read-then-write race
conditions (the classic "two concurrent requests both read the same
stale balance, second write silently clobbers the first" bug).

**Result: no exploitable bug found.** Every balance/status write is
either a single atomic `UPDATE ... SET col = col + $1` (no read-modify-
write in JS at all) or a `SELECT ... FOR UPDATE` whose lock is correctly
held across the read and the later write via an already-open transaction
— payout requests, order mark-paid, and promo redemption all serialize
correctly under concurrent load. This is worth recording precisely
because it's a clean bill of health on the highest-stakes code in the
app, not a gap.

**One defensive hardening applied anyway** (`a0453a0`):
`settleConfirmedOrderEarnings` and `settleDriverDebtFromBalance` both
defaulted their `executor` parameter to the bare (non-transactional)
connection pool, unlike the other read/report helpers in the same file
where that default is harmless. For these two specifically, the `FOR
UPDATE` lock they take only means anything because every *current*
caller happens to pass a transaction-scoped client — the default was a
latent foot-gun that would silently reopen the exact race being audited
for if some future caller (a cron job, a new admin action) ever invoked
either one without explicitly threading a transaction through. Removed
the default so an omitted executor throws immediately instead of failing
silently. Confirmed all three real call sites already pass one
explicitly, so this is a no-op for current behavior.

## Web mounted-component sweep, round 3 (client panel)

Same suspicion as round 2, applied to the last unchecked panel. First
confirmed the root `ClientApp` component itself never unmounts (single
`createRoot().render()` call, no router-driven remounting) — so its own
top-level async handlers (auth flow, order submit/cancel, favorites) were
already safe regardless of guards, since they write to state that always
stays mounted. The real gaps were in child components with their own
lifecycle: `AddressPicker.updateMapCandidate` (a debounced reverse-geocode
call only checked staleness against a *newer* request, never against the
component having unmounted — tapping back or picking a search result
mid-request fired setState after unmount, the highest-plausibility finding
of the seven), `TripsSection.submitRating`, `SupportSection.submit`,
`PromoSection.check`, `QuickMessagesBar.send` (all "submit then navigate
away"), `PriceOfferCard.respond` (a live socket update pulling the offer
out from under an in-flight accept/decline), and
`TripDetailsSheet.handleShare` (lowest plausibility — share/clipboard
promises resolve almost instantly). Two of these call an `onOrderUpdate`
callback that writes to the always-mounted root; deliberately left those
specific calls unguarded, since gating them on the child's own
`mountedRef` would incorrectly drop a legitimate, already-succeeded update
just because the child itself had unmounted (`1a1cfe9`). Verified via
`npm run build` (clean) and a local preview of the public landing page
(this app's default route) — no console errors. Same live-testing
limitation as rounds 1-2: no passenger test credentials or working local
backend to exercise the actual authenticated screens.

This closes out the mounted-component sweep across all three web panels —
admin, driver, and client all independently re-checked beyond whatever the
original audit covered, each time finding real additional instances.

## Web mounted-component sweep, round 2

Noticed the earlier web audit's fix commit (`37cc26d`) only named specific
Admin components and one Client component — no Driver-panel mention at
all. Checked `apps/web/src/features/driver/DriverApp.jsx` directly: its
road-alerts functions (`loadRoadAlerts`, `submitRoadAlert`,
`confirmRoadAlert`, `dismissRoadAlert`) had the exact same setState-after-
await-with-no-unmount-guard gap, just never caught because the first
audit's report didn't cover this file (`d30fd03`). That raised the
question of whether the *largest* panel, `AdminApp.jsx`, got equally
partial coverage the first time — a follow-up audit of everything in that
file the first round didn't touch found 8 more real instances: a tariff
price-preview modal, an order row (advancing status routinely removes the
row from a filtered list before its own request resolves — not an edge
case), a support-ticket card (same "resolving removes it from the current
filter" shape), a broadcast composer, and four save-modals (promo code,
raffle, tariff, region) whose failure-path error display could fire after
the modal was closed (`45af4b5`). All now use the same `mountedRef`
pattern already established in this codebase. Verified via `npm run build`
(clean, both rounds) and a local preview confirming each panel's login
screen mounts with no console errors — could not exercise the actual
authenticated flows live in either case (no admin/driver credentials or
working local backend in this environment), so this is correctness-by-
code-review-and-build, not a live behavioral test, unlike every mobile fix
tonight which was screenshot-verified on the physical device.

## Performance

Dispatched an audit specifically for lag-causing patterns (expensive
per-build work, unmemoized computation in hot 500ms-tick callbacks, missing
`const`, unnecessarily-broad `setState`) across the two heaviest screens
(`driver_shell.dart`, `passenger_shell.dart`). Most of what it checked was
already properly optimized (marker-glide animations correctly scoped to a
narrow `AnimatedBuilder` instead of full-screen rebuilds, image `cacheWidth`/
`cacheHeight` already set, route-refresh already throttled with race
protection) — one real finding, fixed (`52bebdd`): `_nextManeuverHint()`
scanned the full route geometry with Haversine trig to find the driver's
nearest point, then — when real OSRM steps exist — scanned the whole
geometry *again per step* to match each step's location. It's called from
both the navigator's `build()` and the voice-announcement check on every
500ms tick unconditionally, regardless of whether the driver's GPS position
had actually changed. Since the position stream only fires after ~20m of
real movement, most ticks between fixes were recomputing an identical
answer from scratch. Now caches the result and only recomputes when the
route instance changes or the position moved >5m. Live-verified the
maneuver banner still shows correct distance/street data after the change
(no way to directly measure frame-time improvement without profiling
tools not available in this environment, so verification here is
correctness-only, not a measured speedup).

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

## Backend authorization / role & ownership audit

Dispatched a targeted audit of `requireRole` usage and per-resource
ownership checks across every module — a distinct bug class from the
async-error-handling and money-concurrency audits done earlier tonight.

**Result: the role/ownership model is correctly enforced almost
everywhere.** Every CLIENT/DRIVER-facing endpoint checked (orders, wallet,
client-wallet, favorites, recurring-bookings, driver-documents,
driver-avatar, notifications, referrals) re-derives the actor's own
`client.id`/`driver.id` from `req.user.id` and scopes the query to it.
Money-moving code re-verifies ownership before mutating. OWNER-can-act-
on-any-order and OWNER/FINANCE admin-sees-everything are intentional and
correctly scoped. The retired OPERATOR role was cleanly migrated to OWNER
(`migrations.js:800-807`); the only surviving `CANCELLED_BY_OPERATOR`
reference is a status *label*, not a role check.

**One real bug found and fixed**: `PATCH /driver/road-alerts/:id/expire`
(`apps/api/src/modules/road-alerts/road-alerts.routes.js`) set
`status='EXPIRED'` unconditionally on the very first call from *any*
driver, regardless of how many times the alert had already been confirmed
by others — a single "Нет" tap (even accidental, from a driver who never
saw the hazard) could permanently kill a multiply-confirmed alert for
everyone. This contradicted both the client's own "hidden from your list"
copy (`driverAlertHiddenFromList`) and the gradual, capped, self-vote-
blocked design already used by the sibling `/confirm` endpoint. Fixed so a
third-party dismissal only actually expires the alert once repeated
dismissals have driven `confidence_score` to zero (mirrors `/confirm`'s
design); the reporter's own retraction stays immediate. The privileged
admin override (`admin.routes.js` `/road-alerts/:id/expire`, OWNER-only) is
untouched — an unconditional moderation action is correct there.

## Backend SQL injection audit

Also dispatched a check of all raw-SQL construction (the backend uses `pg`
directly, no ORM) — 316 `query()`/`client.query()` call sites across every
module reviewed. **Result: clean, no findings.** Every request-derived
value reaches SQL through a `$1`/`$2` placeholder; no template-literal or
string-concatenation splicing of user input into query text anywhere.
Dynamic `UPDATE ... SET` column selection (tariffs, regions, finance
report `groupBy`) is always gated by a hardcoded allowlist/map before the
column name reaches the SQL string, never taken from the request
directly. No dynamic `ORDER BY`/sort endpoints exist at all.

## Flutter resource-leak audit (Timers / streams / controllers)

Directly tied to the user's explicit "no lags" requirement: a leaked
`Timer.periodic`, GPS position-stream subscription, or animation controller
keeps firing (setState calls, network calls, GPS listening) even after its
owning widget is gone, accumulating slowdown across a long session of
screen navigation. Audited every StatefulWidget in `driver_shell.dart` (9),
`passenger_shell.dart` (22), and every supporting screen/sheet file under
`lib/features/driver/` and `lib/features/passenger/` — roughly 14
Timers, 9 StreamSubscriptions (incl. 2 `Geolocator.getPositionStream`
listeners), 10 AnimationControllers, 25 TextEditingControllers.

**Result: clean, no missing dispose/cancel calls found anywhere.** Every
class uses manual per-field tracking, all torn down in `dispose()`. Two
one-shot `Timer(duration, ...)` banner-auto-clear calls in
`driver_shell.dart` (~1209, ~1308) aren't stored in a field, but both guard
their callback with `if (mounted)` and self-resolve after firing once — not
a genuine leak, just a minor style inconsistency versus the rest of the
file, left as-is.

## Web XSS + backend rate-limiting spot checks

- **XSS**: the only two `innerHTML` assignments in the whole web codebase
  (`apps/web/src/features/map/MapView.jsx:88,92`, marker icon SVGs) are
  hardcoded static strings selected from a fixed 3-branch type switch —
  never user-controlled. No `dangerouslySetInnerHTML` anywhere. Clean.
- **Rate-limiting**: every sensitive auth endpoint (`/auth/login`,
  `/auth/login/password`, `/auth/register/password`, `/auth/sms/send`,
  `/auth/sms/verify`, `/auth/password/reset/request`,
  `/auth/password/reset/confirm`) already has `rateLimit(...)` applied
  with sane per-endpoint windows/maxes. Already solid, no gap found.

## Order-acceptance race condition (explicitly confirmed safe)

The single most classic ride-hailing correctness bug — two drivers tapping
"accept" on the same order at the same instant — was only mentioned in
passing by the RBAC audit, so checked it directly rather than take that on
faith. `POST /orders/:id/accept` (`orders.routes.js:714`) wraps the whole
handler in `tx(async (client) => ...)`, and `acceptOrderForDriver`
(`order-dispatch.service.js:371`) takes `SELECT * FROM orders WHERE id=$1
FOR UPDATE` before checking `existing.driver_id`/`OPEN_ORDER_STATUSES`.
Two concurrent accepts serialize on that row lock; the second sees the
order already taken and throws `ORDER_ALREADY_ACCEPTED`. Confirmed safe,
no fix needed.

## Full regression check after tonight's combined mobile + web changes

Individual mobile edits were each verified per-file during the session;
ran one more pass verifying the *combined* effect of all of them together:
`flutter analyze` (whole project, no issues), `flutter test` (all 35
tests passing), and `npm run build` for the web panels (clean compile, no
new errors). Confirms none of tonight's fixes conflict with each other.

## Mobile accessibility audit

Dispatched a check of screen-reader support and touch-target sizing
across the driver/passenger shells — a "convenient" dimension distinct
from everything else checked tonight (visual consistency, dark mode,
correctness, performance). Overall the app is not broadly inaccessible:
the driver-side map controls (`_NavCircleButton`, `DriverSosButton`) were
already a good example, wrapping icon-only controls in
`Semantics(button:true, label:...)` with 44-46px targets. The gaps were
concentrated on the passenger side, where that pattern wasn't mirrored.

**Fixed**: the passenger SOS button (`_SafetyButton`) — the app's single
most safety-critical control — had no Semantics label at all and a 34x34
tap target, smaller than its own driver-side counterpart. The driver
contact-card's call/chat icons (`_RoundIconButton`) were the same:
unlabeled, 36x36. Both now wrap in `Semantics(button:true, label:...)`
(reusing existing l10n strings — `passengerSafetyTitle`,
`passengerChatFallbackTitle`, `passengerCallPhoneLabel`) and use 44x44
minimum tap targets, matching the driver-side pattern. Verified safe via
Row/Expanded structural review (not a Stack/Positioned overflow risk, see
below) plus `flutter analyze`/`flutter test`, since live-verifying the
passenger active-trip-with-assigned-driver screen would need a
coordinated two-role live order.

**Bigger find while live-verifying the third fix**: the shared driver
bottom-sheet close button (`_showDriverFullSheet`, reused across 9 driver
screens — Profile, Wallet, Rating, Notifications, Support, FAQ, About,
Settings, Recurring Bookings) turned out to be both invisible *and*
untappable, not just missing a tooltip. Its `Stack` had no explicit size,
so it shrink-wrapped to its only non-positioned child (the ~14px drag
handle) in both width and height; Stack's default `Clip.hardEdge` then
clipped away the 48px-tall `Positioned` close button below that ~14px
line, and `right: 8` resolved against the narrow handle-width box instead
of the sheet's actual right edge. An on-device tap at the button's coded
location did nothing — confirmed dead, not just hard to see. Fixed by
giving the Stack an explicit full-width, 48px-tall `SizedBox` to lay out
in; a fresh screenshot confirms the X is now visible in the correct
top-right position, and tapping it closes the sheet. This affected all 9
screens that reuse this helper, and would never have surfaced from
`flutter analyze`/`flutter test` alone — only caught because a screenshot
was taken to verify the accessibility fix.

## Navigator quality pass (2GIS/Yandex Navigator/Google Maps parity)

User directive: make the navigator match professional turn-by-turn apps.
Dispatched a targeted audit comparing the current implementation against
2GIS/Yandex Navigator/Google Maps, scoped to gaps solvable with data the
app already has (not the OSM camera/traffic sparse-coverage limitation,
already documented above as out of scope). Four concrete gaps found and
fixed:

1. **Live ETA/distance recompute** — previously the distance/ETA to
   pickup/dropoff only updated on the backend's own refetch cadence (12s,
   phase change, or 60m off-route), sitting frozen for up to 12s of real
   driving between refreshes. Now projects the current position onto the
   already-drawn route geometry every tick (same technique
   `_computeNextManeuverHint` uses) and scales the last-fetched duration
   by the resulting distance ratio.
2. **Maneuver banner urgency escalation** — the visual banner was a
   single flat style regardless of distance, even though voice guidance
   already staged at 200m/40m. Now the banner's color/icon size escalate
   through the same two tiers, eased via `AnimatedContainer` instead of
   jumping.
3. **Proactive arrival detection** — reaching the pickup/dropoff required
   the driver to notice on their own and tap the status button. Added a
   40m proximity check that highlights the button (glow) and fires one
   haptic buzz — deliberately not auto-firing the status change itself,
   since "Arrived" starts the waiting-fee timer and notifies the rider.
4. **Smooth camera transitions** — the full-screen Navigator's camera
   jumped under the self-marker every 500ms tick (direct `moveAndRotate`
   calls) while the marker itself already glided smoothly via its own
   `AnimationController` — the ground was visibly snapping under a
   smoothly-moving car. Mirrors that same technique for the camera.

Two real bugs caught and fixed while building #4: `latlong2`'s `LatLng`
has no value `==`, so an early version of the "did the target change"
check compared object identity and would have restarted the glide every
single 500ms tick even while parked; and an in-flight follow-glide needed
an explicit `stop()` the instant the driver grabs the map, or it would
keep calling `moveAndRotate` against their finger for whatever remained
of its ~700ms duration.

Verified: `flutter analyze` (whole project, clean), all 35 tests passing,
on-device install confirming no visual regression on the Line/Trip/
Navigator screens. Could not live-verify the banner escalation or camera
glide itself with real GPS movement — this physical device has no mock-
location tooling set up, and building one just for this would be its own
undue scope/risk. That part rests on code review plus the two bugs caught
above, not on watching it drive; flagging this explicitly rather than
claiming a live test that didn't happen.

Order-acceptance race safety (already confirmed earlier tonight) and
off-route rerouting (`_maybeRefreshDriverRoute`, confirmed already
correct by the audit) round out the areas checked against professional
navigator behavior. One remaining item from the audit, lane guidance, is
deliberately left alone: OSRM's `intersections[].lanes` data isn't
currently passed through by the backend's step mapper, and OSM's own lane
tagging coverage for these regions is uncertain — a minimal pass-through
would be cheap, but without knowing how often real lane data actually
exists here, it's more honest to leave it as a known future item than
ship a hint that might rarely have anything to show.

## Not done / known limitations

- Navigator road-sign/camera data is only as complete as OpenStreetMap's
  coverage for these regions — already reported earlier this session as a
  data-availability limit, not a code bug.
- The Flutter-side root cause of *why* a bare Row child broke `Positioned`'s
  bottom-anchoring wasn't fully isolated (no exception, no RenderFlex
  overflow logged) — worked around structurally instead of chasing the
  underlying Flutter layout mechanism further, given the fix verified clean
  via direct A/B testing.
- Checked whether the passenger side needed the same live-ETA/smooth-camera
  treatment as the driver navigator. It doesn't, to the same degree: the
  passenger's "driver ETA to pickup" already refetches every 8s (throttled,
  socket-driven — `_loadDriverRoute` in passenger_shell.dart), tighter than
  the driver's 12s window that motivated the fix there, and the passenger
  map's camera deliberately only re-centers when a point falls outside the
  visible area (`_MapCanvasState._refitCamera`) rather than every tick —
  a reasonable design for a passive observer, not a driver actively
  navigating. No change made.
