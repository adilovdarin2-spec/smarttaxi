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

## Not started yet — items 4–16

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
- **§6 "забыл вещь"**: the support topic must be sent as the literal string
  `LOST_ITEM`, not the Russian label, for the backend to notify the right
  order's driver — found and fixed on web tonight, applies identically here.
- **§4 recurring bookings**: backend module exists and is mounted
  (`/api/recurring-bookings`), not yet wired anywhere per either status doc.
- **§5 navigator voice alerts**: `osm-navigation.service.js` exists per
  brief, not yet cross-checked against a status doc.
None of §4–16 were implemented on mobile yet — flagging honestly rather
than claiming partial coverage that isn't there.

## Verification method note

No real backend/OTP credentials were available in this session to log in on
the live device, so anything past the auth screen (map, markers in situ,
order flow) could only be checked by `flutter analyze` + a clean debug build,
not a live screenshot. Said so explicitly per file above rather than
implying more was confirmed than actually was.
