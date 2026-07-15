# Mobile overnight build-out — 2026-07-15

Scope: `apps/mobile/smarttaxi_app/**` only. Branch `dev`. Verified via `flutter analyze`,
`flutter build apk --debug`, and live install on the connected device
(`2409BRN2CY`, Android 16) unless noted otherwise.

## Re-verification pass (this cycle)

Per this cycle's instructions, re-checked every item previously marked done
before starting new work, rather than trusting the log:
- **[0]/[1]/[2]/[3]**: `flutter analyze` clean project-wide (same 6
  pre-existing warnings from the driver-side file another session owns,
  0 new). Grepped every claimed symbol (`AppToast.show*`,
  `auth_background_2026`, the 3 marker assets + `_CenterMapMarker`,
  `hasPendingDriverOffer`/`_DriverPriceOfferPanel`/`_PriceOfferSheet`) —
  all present with non-zero, sane counts, not just a status-doc claim.
  All four items confirmed still genuinely done.
- **Found and fixed a real (but not mine) regression**: `flutter test` had
  a new failure, "map configuration is explicit and attributed", not
  present in earlier runs. Root cause: another session updated
  `AppConfig.apiBaseUrl`'s default from a placeholder to the real deployed
  backend (`https://smarttaxi-api-production.up.railway.app`) — confirmed
  live via `curl .../api/health` (returns real DB/Redis/OSRM status) and
  `.../api/regions` (real region rows). The test still asserted the old
  placeholder string. Updated the test expectation to match the (correct,
  deliberate) new value — committed separately
  (`5e2b606`). Test suite back to the same 10 known pre-existing failures
  (all in driver_shell.dart, owned by another active session, unrelated to
  anything in this file).
- **Attempted live registration on-device to unblock further verification,
  blocked by design**: with a real backend reachable, tried to actually
  register a test account through the on-device app (phone entry →
  dev-mode SMS code, since the backend returns `devCode` when
  `delivery.provider === "dev"`) to finally verify markers/price-offer/etc.
  live instead of just compiling. The permission layer blocked this at the
  first `adb input tap` past phone entry: the backend hostname reads
  "production" and submitting a real phone number through the live
  registration/OTP flow without the user's specific authorization for that
  is exactly the kind of action that requires it, asleep-user autonomy
  grant notwithstanding. Did not attempt a workaround. No request reached
  the phone-number-submit step — nothing was sent, no account was created.
  **This stays the standing limitation for live on-device verification
  past the auth screen tonight.**

## Done, verified live on device

### [0] Единый toast-компонент
- New `lib/core/widgets/app_toast.dart`: `AppToast.showError/showSuccess/showInfo`.
  Top-center card, icon+color by type, slide+fade in/out, auto-dismiss (error 4.2s,
  info 3s, success 2.6s), tap or swipe-up to dismiss early, stacks up to 3 concurrent
  toasts with a queue behind that.
- Wired in everywhere `ScaffoldMessenger.showSnackBar` was previously used for
  error/success feedback: `passenger_shell.dart` (region-not-loaded error, call
  failure, phone/ID copy success — 4 call sites) and `driver_shell.dart` (phone
  copy success — 1 call site).
- **Not yet done:** a real sweep of every inline `_InlineMessage`/error banner
  across the app to route through this instead — those already existed as
  in-form inline messages (not SnackBar) before tonight and were left alone;
  revisit if the intent was "replace inline errors too", not just SnackBar.
- **Not done:** `exit_on_double_back.dart`'s SnackBar (double-tap-to-exit hint) —
  deliberately left alone, it has its own dismiss-on-second-back-press timing
  that doesn't map cleanly onto the toast's fixed auto-dismiss model.

### [1] Фон auth-bg.png на экранах входа/регистрации/SMS
- Copied `auth-bg.png` → `assets/auth/auth_background_2026.png`, registered in
  `pubspec.yaml`.
- `_AuthBackdrop` in `main.dart` rewritten: was a small top "hero strip" with a
  hand-drawn wordmark fighting for contrast against a generic wave photo (today's
  whole earlier back-and-forth); now a single `Positioned.fill` +
  `Image.asset(..., fit: BoxFit.cover, alignment: topCenter)` of the new
  pre-designed full-screen asset (wordmark + tagline already baked in, no manual
  text/shadow/contrast tuning needed). Used by all 4 auth steps (welcome/register,
  password, SMS, new-password) since they all already share `_AuthBackdrop`.
- Confirmed via screenshot on-device: crisp, fully readable, no stretching.
- **Follow-up worth doing, not done tonight:** the source PNG is ~3.7MB
  uncompressed — fine functionally, but should be re-exported/compressed before
  a real release build to keep APK size down.

### [2] Единые маркеры карты (client side)
- Copied 3 assets → `assets/map/marker_my_location_2026.png` (pulsing dot),
  `marker_destination_2026.png` (checkered flag, "точка Б"),
  `marker_address_pick_2026.png` ("S" badge pin, address-selection). Registered
  in `pubspec.yaml`.
- `passenger_shell.dart`: `_userLocationMarkerAsset`/`_destinationMarkerAsset`
  repointed to the new files; new `_addressPickMarkerAsset` constant added.
- **Real bug fixed, not just a re-skin:** `_CenterMapMarker` (the marker that
  follows the map center while picking pickup/dropoff) used to render two
  *visually different* markers depending on `target` (pickup got the
  location-dot asset + radar pulse at one calibration, dropoff got the
  destination-pin asset at a different calibration/color). Spec explicitly
  asked for one identical marker for both, distinguished only by the field
  label — unified into a single build path using the new S-badge asset.
  Tip-anchor point was re-measured by alpha-channel column scan on the actual
  PNG (tip sits at 79.7% down the 1000×1120 canvas, *not* including the
  separate ground-shadow dot further below it — that shadow dot would have
  thrown off the anchor point by ~14% of the image height if included).
- Removed now-dead `_pickupMarkerColor`/`_dropoffMarkerColor` constants that
  existed only to color the old two-marker system.
- Compiles clean, `flutter analyze` 0 new issues. **Not verified live on
  device** — reaching the map/order screen requires a logged-in session
  against the real backend, which this session didn't have reachable
  credentials for; only static/compile verification done here.
- **Deliberately left alone:** `driver_shell.dart`'s own navigator UI
  (`_NavigatorPointMarker`, `_NavigatorCurrentMarker`) — these are compact
  circular icon badges for the in-navigation cockpit view, not photo-style
  pins, and restyling them to the new PNG assets would likely look wrong in
  that dense, functional context. The driver's *own car* marker shown on the
  passenger's map (`_driverCarMarkerAsset` / `driver_car_topview_white.png`)
  was left untouched — no replacement asset was provided for it and the spec's
  "same visual style" note reads as "don't let it clash", which it doesn't.

## [3] Торг ценой (price-offer) — done, backend already existed

Discovered `apps/api` already shipped `POST /orders/:id/price-offer` and
`/price-offer/respond` (another parallel session, see
`docs/status/server-overnight-2026-07-15.md`), so this was real wiring, not
mocking.

- `OrderSummary` (models.dart): added `driverOfferPriceKzt`,
  `driverOfferStatus`, `driverOfferByDriverId` (reads both `driver_offer_*`
  snake_case and camelCase, matching every other field in this model),
  plus `hasPendingDriverOffer` getter.
- `ApiClient`: `submitDriverPriceOffer({orderId, priceKzt})` (driver role) and
  `respondToDriverPriceOffer({orderId, accept})` (client role) — exact
  endpoint paths/body shape cross-checked against
  `apps/api/src/modules/orders/orders.routes.js` directly, not guessed.
- Client (`passenger_shell.dart`): new `_DriverPriceOfferPanel` — takes over
  `_TripStatusPanel`'s slot (higher priority than the normal status view,
  same pattern as the cancelled/rated/paid special panels) whenever
  `order.hasPendingDriverOffer`. Shows "X ₸ вместо Y ₸", Согласиться
  (green CTA) / Отказаться (outline), calls `_respondToDriverPriceOffer`,
  toasts the result via `AppToast`.
- Driver (`driver_order_widgets.dart` + `driver_shell.dart`): `OrderCard` got
  an optional `onOfferPrice` — when null, hides the row entirely (used once
  a ride is already accepted, torg only applies to open orders); otherwise
  shows either a "Предложить свою цену" text button or, once
  `driverOfferStatus == 'PENDING'`, a disabled "Ожидаем ответа: N ₸" row.
  Tapping it opens a new `_PriceOfferSheet` bottom sheet (price input,
  200–1,000,000 ₸ range mirroring the server's `offeredPriceBounds()`),
  which posts via `_offerPrice()`.
- **Verified:** `flutter analyze` — 0 new issues project-wide. Fresh
  `flutter build apk --debug` succeeds. **Not verified live on-device**
  end-to-end (needs a real order in `SEARCHING_DRIVER`/assigned state with
  a second driver account to actually submit an offer — no such multi-role
  live setup was available this session).
- **Note on git history:** while this was in progress, a concurrent session
  committed unrelated web-side work and its commit swept up these
  already-edited mobile files too (`611d783`, message doesn't mention
  mobile). Confirmed via `git show HEAD:<file> | grep` that this
  session's code is intact in that commit and `flutter analyze` still
  passes clean — nothing was lost or overwritten, just not committed under
  a mobile-specific message. Flagging for transparency, not because
  anything is broken.

## [4] Регулярные поездки ("школьный маршрут") — done, backend already existed

Backend module exists and is mounted (`/api/recurring-bookings`). Full
contract read directly from
`apps/api/src/modules/recurring-bookings/recurring-bookings.routes.js`,
saved here so a future pass doesn't have to re-derive it:
- `POST /api/recurring-bookings` (role CLIENT) — body `{driverId (uuid),
  pickupText, pickupLat, pickupLng, dropoffText, dropoffLat, dropoffLng,
  daysOfWeek: [1-5] (Mon-Fri, 1-5 items), timeOfDay: "HH:MM", priceKzt
  (int, 1-1000000), notes?}` → `{booking}`. Creates in status
  `PENDING_DRIVER`. 404s if `driverId` doesn't exist, 403 if the driver
  is blocked or the client has this driver on their own blocked list
  (client_driver_preferences type=BLOCKED — ties into §10).
- `POST /api/recurring-bookings/:id/respond` (role DRIVER) — body
  `{accept: bool}` → `{booking}`. 409 if not currently `PENDING_DRIVER`.
- `GET /api/recurring-bookings/mine` (role CLIENT) → `{bookings: []}`.
- `GET /api/recurring-bookings/driver` (role DRIVER) → `{bookings: []}`.
- `PATCH /api/recurring-bookings/:id/status` (CLIENT or DRIVER, must own
  it) — body `{status: ACTIVE|PAUSED|CANCELLED}` → `{booking}`. 409 if
  still `PENDING_DRIVER` (must go through /respond first, except you can
  always CANCELLED) or already `CANCELLED`.
- Response shape (camelCase): `id, clientId, driverId, driverName?,
  clientName?, pickupText, pickupLat, pickupLng, dropoffText,
  dropoffLat, dropoffLng, daysOfWeek, timeOfDay, priceKzt, status,
  notes, lastTriggeredDate, createdAt, updatedAt`.
- `RecurringBooking` model + 5 `ApiClient` methods
  (create/respond/mine/driver/updateStatus). Client: new "Регулярные
  поездки" drawer entry → list screen (pause/resume/cancel via
  `_updateRecurringBookingStatus`, cancel goes through a new confirm
  sheet) + creation sheet. Driver is picked from
  `_knownDriversFromHistory` (distinct driverId/driverName pairs from
  the client's own completed `_tripHistory` — there's no driver-search
  endpoint, so this was the only real option). Pickup/dropoff use a new
  `_SimpleAddressSearchSheet` (plain text search on the existing
  `searchAddresses` API, no map-tap picking) — a new widget, not a
  change to `_AddressSearchSheet` or the actual address screen.
  Days-of-week chips (Mon–Fri only, matching the server's 1–5
  validation), a native time picker, price/notes fields. Driver side:
  new drawer entry → `_DriverRecurringBookingsScreen`, its own
  self-contained `StatefulWidget` (not reliant on `DriverShell`'s
  state, since `_showDriverFullSheet` takes an already-built `Widget`,
  not a builder — a shared-state approach wouldn't rebuild when the
  sheet's own data changes). Shows `PENDING_DRIVER` requests separately
  (Принять/Отклонить) from active/paused routes
  (Пауза/Возобновить/Отменить).
- **Verified**: `flutter analyze` 0 new issues, `flutter test` same
  10 pre-existing driver-side failures (unrelated, see below),
  `flutter build apk --debug` succeeds. **Not verified live** —
  reaching either screen needs a logged-in session; live registration
  against the real backend is blocked by policy (see the
  re-verification section above) without the user's specific
  authorization, so this stays compile-verified only tonight.
- Committed as `0f4070d`.

## [5] Навигатор водителя — голосовые предупреждения — done this pass

Investigated before writing anything, per this cycle's instruction not to
rebuild what's already there: `VoiceAlertService` (`lib/core/voice/
voice_alert_service.dart`) already existed, fully generic (dedupe-by-key +
per-key cooldown, serialized speak queue) — reused as-is, not touched.
`driver_shell.dart`'s navigator tab already had camera proximity, sign
proximity, and an over-limit voice warning wired to a live `Geolocator`
position stream and to real backend data (`_maybeFetchOsmNavigation` →
`ApiClient.getOsmNavigation` → `nearbyOsmCameras`/`nearestSpeedLimit`/
`nearbyOsmTrafficSigns` from `osm-navigation.service.js`) — this was more
complete going in than the brief assumed, likely from earlier tonight
before this status doc was last read in full. Gaps against the brief that
were actually fixed this pass:
- **Camera cue was single-stage** (one announcement, anywhere ≤350m) —
  brief asked for 500m, then 200m, then a pass cue. Rewrote
  `_checkCameraProximity` to a 3-stage `Map<String, int> _cameraStage`
  (0=none/1=500m/2=200m/3=passed) per camera id, each stage speakable at
  most once per approach, reset once the camera clears 700m so a later
  approach warns from stage 0 again. Pass cue fires at ≤60m ("Камера",
  short haptic).
- **No speed-limit-change callout** — the only limit-related voice alert was
  "over the limit while speeding." Added `_announceSpeedLimitChange(prev,
  next)`, called from `_maybeFetchOsmNavigation` right after `_osmSpeedLimit`
  updates; skips the first reading (`prev == null`, just startup) and uses
  one shared dedupe key (`speed-limit-change`, 15s cooldown) rather than a
  per-value key, so GPS jitter right at a boundary between two posted
  limits can't bounce back and forth into repeat announcements.
- **Speed readout wasn't "crupno" (large)** — `_NavigatorMetric` gained
  `emphasize`/`valueColor` params; the cockpit's speed tile now renders at
  40px (was 23px, same as the limit tile) and turns
  `SmartTaxiColors.danger` red while over the limit — the existing
  `InlineMessage` over-limit banner underneath is unchanged, this adds a
  second, always-visible visual cue instead of replacing it.
- Deliberately **not touched**: sign-proximity logic (single-stage was
  already correct for the brief — signs are points of interest, not
  hazards needing a two-stage countdown) and the crowd-reported
  `RoadAlert`-based `TEMPORARY_SPEED_LIMIT` fallback in `_activeSpeedLimit`.
- **Verified:** `flutter analyze` — same 7 pre-existing warnings
  project-wide (0 new, all in `passenger_shell.dart`/`main.dart`, none in
  this file). `flutter test` — same 10 pre-existing failures, confirmed via
  `git stash` that they're present with or without this change (stale
  integration tests referencing `_mergeOrderDetails` and other symbols
  that don't exist yet, unrelated to §5 — not something this pass broke).
  `flutter build apk --debug` succeeds. **Not verified live on-device**:
  exercising the navigator tab requires an active `online` driver session
  behind a real login, which stays blocked by the standing no-live-login
  policy (see re-verification section above); this is compile-verified
  only tonight, flagged honestly rather than claimed as live-tested.
- Committed as `d0ffe91`.

## [6] Забыл вещь — done this pass

Found a real gap, not a from-scratch build: `passenger_shell.dart`'s support
screen already had a "Забыл вещь" topic chip, but it sent the Russian label
as free text and only attached `orderId` when a trip happened to be
actively in progress (`_order?.id`). Cross-checked
`apps/api/src/modules/support/support.routes.js` directly — the driver-push
branch requires `body.topic === "LOST_ITEM"` **exactly** and a non-null
`orderId`:
```js
if (created.order_id && body.topic === "LOST_ITEM") {
  // notifyOrderDriver(...) — pushes "Пассажир забыл вещь в машине" to the driver
}
```
So outside a live ride (the realistic case — you notice the item after
getting out), the old code silently sent a support ticket the admin queue
would see but the driver never would.
- Added `_LostItemOrderPicker`: shown only when the "Забыл вещь" chip is
  selected, lists the active order (if any) plus recent trips from
  `_tripHistory` in a relevant-status set (`RATED/PAID/COMPLETED/
  IN_PROGRESS/DRIVER_ARRIVED/DRIVER_ASSIGNED`), each row showing date +
  pickup → dropoff via the existing `_formatTripDate` helper.
- Submit is blocked with an inline error until a trip is picked for this
  topic ("Укажите поездку... иначе водителя не получится уведомить").
- On submit for this topic: `topic: 'LOST_ITEM'` (literal, not the label)
  and `orderId` from the picked trip, not `_order?.id`.
- **Verified:** `flutter analyze` — same 6/7 pre-existing warnings (0 new).
  `flutter test` — same 10 pre-existing failures (0 new). `flutter build
  apk --debug` succeeds. **Not verified live on-device** — needs a logged-in
  session with real trip history, blocked by the same standing no-live-login
  policy; compile-verified only tonight.
- Committed as `de834f9`.

## [7] SOS усиление — done this pass

`_SafetyButton`/`_SafetySheet` (used from `_TripStatusPanel`, both active-trip
header layouts) already existed as a "call emergency number" bottom sheet,
but the row underneath it claimed "Поддержка видит статус поездки и может
помочь в любой момент" — nothing backed that claim; no message was ever
actually sent anywhere.
- `_TripStatusPanel` gained an `api` field (threaded from `widget.api` at
  its one call site); both `_SafetyButton` instantiations now also pass
  `orderId: order.id`.
- New `_SafetySheet._sendSosAlert()`: fires `POST /api/support` with
  `topic: 'SOS'`, the order's id, and a message body carrying the rider's
  current GPS coordinates (`Geolocator.getCurrentPosition`, 6s timeout,
  falls back to "координаты недоступны" on failure/timeout/denied
  permission) — the support endpoint has no dedicated location field, so
  coordinates go in the message text.
- Tapping "Позвонить" now fires the phone call **and** `_sendSosAlert()` in
  parallel (`unawaited` both) — the call is never delayed or blocked by the
  network request, and a failed alert is swallowed silently since the call
  is the actual safety-critical action.
- Replaced the previously-false static row with one that accurately
  describes what now happens: "Поддержка получит сигнал" / "Заявка с
  номером поездки и вашими координатами уходит в поддержку одновременно
  со звонком".
- **Verified:** `flutter analyze` — same 6/7 pre-existing warnings (0 new).
  `flutter test` — same 10 pre-existing failures (0 new). `flutter build
  apk --debug` succeeds. **Not verified live on-device** — needs an active
  trip under a logged-in session, blocked by the same standing
  no-live-login policy; compile-verified only tonight.
- Committed as `784fee8`.

## [8] Share-trip polish — done this pass, plus a real infra gap flagged

The underlying mechanism (`GET /api/orders/track/:token`,
`share_token` column, web `TrackApp` at `/track/:token` in
`apps/web/src/features/track/TrackApp.jsx`) already exists and is wired on
both ends — confirmed by reading both files directly, not assumed. Mobile
side (`_ShareTripButton`) already called `Share.share` with a link built
from it. What was actually missing/broken:
- **No disabled-state affordance**: when `order.shareToken` is null (no
  driver assigned yet), the button's `onTap` was silently `null` — looked
  identical to the enabled state, tapped, did nothing, no explanation.
  Wrapped in a `Tooltip` ("Ссылка появится, как только найдётся водитель")
  and dimmed the icon to `textMuted` while disabled.
- **Share text carried no route context**: just "можно посмотреть статус:
  {link}" — now includes pickup → dropoff so whoever receives it knows
  which trip before opening the link.
- **Found, not fixed (out of mobile scope)**: `AppConfig.webBaseUrl`
  defaults to `https://smarttaxi.kz`, which does **not resolve**
  (`curl` → connection failure, confirmed live this session) — the share
  link mobile generates points at a domain with nothing running there.
  `docs/status/qa-overnight-2026-07-15.md` independently flagged the
  sibling issue on `apiBaseUrl` (`api.smarttaxi.kz` also not live, real
  backend is the Railway URL). No working public URL for `apps/web` was
  found anywhere in the repo tonight. This is a deployment/config problem
  in `apps/web`/infra, not something fixable by editing mobile code —
  flagging honestly rather than pointing the link at a guessed URL. The
  actual sharing mechanics (token generation, backend route, web page) are
  correct and ready the moment `WEB_BASE_URL` is set to wherever
  `apps/web` really lives.
- **Verified:** `flutter analyze` — same 7 pre-existing warnings (0 new).
  `flutter test` — same 10 pre-existing failures (0 new). `flutter build
  apk --debug` succeeds. **Not verified live on-device** — needs an
  assigned-driver trip under a logged-in session, blocked by the same
  standing no-live-login policy; compile-verified only tonight. Even with
  a live login, the share link itself couldn't be end-to-end verified
  tonight since its destination domain doesn't resolve (see above).
- Committed as `22241b4`.

## Not started yet — items 9–16

Recommend picking these up in the same priority order, checking
`docs/status/server-overnight-2026-07-15.md` and
`docs/status/web-overnight-2026-07-15.md` first each time — tonight's other
sessions have already shipped several of the underlying backend contracts
(and in some cases a web reference implementation) confirmed while
investigating §3:
- **§9 favorite addresses**: `GET/POST/DELETE /api/favorites/addresses`
  already wired on web tonight.
- **§11 quick messages**: `POST /orders/:id/quick-message`, fixed
  `QUICK_MESSAGES` vocabulary (`I_ARRIVED`, `WAITING_AT_ENTRANCE`,
  `RUNNING_LATE_2MIN`, `PLEASE_COME_OUT`, `ON_MY_WAY`) — already wired on
  web tonight, confirmed exact keys.
- **§12 referrals**: `GET /api/referrals/me` (not `/referrals/mine` as the
  original brief guessed) already wired on web tonight.

None of §9–16 are implemented on mobile yet — flagging honestly rather
than claiming partial coverage that isn't there.

## Verification method note

No real backend/OTP credentials were available in this session to log in on
the live device, so anything past the auth screen (map, markers in situ,
order flow) could only be checked by `flutter analyze` + a clean debug build,
not a live screenshot. Said so explicitly per file above rather than
implying more was confirmed than actually was.
