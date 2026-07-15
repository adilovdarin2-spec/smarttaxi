# Mobile driver overnight — 2026-07-15

Scope: `apps/mobile/smarttaxi_app/lib/features/driver/**` and directly related shared
models/API client methods. Passenger side (`lib/features/passenger/**`) was being worked
by a parallel session and was not touched, per instructions.

## Verification status (read this first)

On-device install was blocked for most of the night (`INSTALL_FAILED_USER_RESTRICTED`,
then the phone dropping off USB entirely). It cleared intermittently around 19:50–20:45
(most likely from the phone being physically handled), and a real on-device pass was
completed against the driver test account (`+77000000000` / password `123456`, seed.js)
via adb + uiautomator:

- **Confirmed working, screenshotted:** Line tab layout with the new "Недоступен по
  региону" status pill (both the header pill and the DriverShiftHero row) and the new
  SOS button next to it; tapping SOS opens `_DriverSosSheet` with the real
  `sosPhone` from `/regions/service-settings` and correct copy; Trip tab empty state
  correctly hides the SOS button when there's no active order (only shown once
  `_activeOrder != null`, as coded); the drawer opens/scrolls; the new logout
  confirmation dialog ("Выйти из аккаунта?" / Назад / Выйти) appears and both its
  Cancel and (by code-sharing) Confirm paths work.
- **Not exercised live:** waiting timer, trip-completion/rating card, favorite/block
  buttons, call-passenger button — all require an actual assigned/active order, which
  needs a second (passenger) account placing a real order through dispatch; out of
  reach for a solo overnight pass. These are unverified beyond `flutter analyze` +
  code review, per [[feedback_screenshot_verify_before_done]] don't treat them as
  fully "done" until someone drives an actual trip through them.
- **Found and fixed during this pass, not a mobile bug:** the very first live test used
  a stale APK (built before the toast/driver-id-scoping/cancel/no-show/logout-confirm
  commits) — the logout confirmation appeared to silently not exist until the app was
  rebuilt and reinstalled with the current commit. If a future session sees a "missing"
  feature live, rebuild before assuming the code regressed.
- **Found and NOT fixed (out of scope, flagged separately):** the shared login screen's
  phone-number field scrambles already-typed digits on certain rebuild/refocus events —
  spawned as a separate task (see memory) since it's outside `lib/features/driver/**`
  and could be blocking real users from logging in reliably.

Also relevant if live-testing against prod: the deployed Railway API is currently missing
several newer routes present in the repo (`/favorites/addresses`, `/favorites/drivers`,
`/recurring-bookings/mine`, `/orders/:id/quick-message`, confirmed via curl ~19:00). If a
live test shows a 404 on a route this doc says exists in the repo, that's the stale
deploy, not a bug introduced tonight — curl the endpoint directly before assuming a
regression.

## What already existed (audited, not rebuilt)

1. "На линии" — online/offline toggle, incoming-order flow, all pre-existing and working.
2. Incoming order card (distance/ETA/price/accept/decline) — pre-existing.
3. Driver price negotiation ("Предложить свою цену", price-offer/respond) — pre-existing.
4. Navigation to pickup (route, ETA, quick messages, "Я на месте") — pre-existing.
6. Trip navigation to dropoff — turn-by-turn hint, camera/sign/speed voice cues at
   500m/200m/on-pass, large speed cockpit display, OSM navigation backend — pre-existing.
11. Earnings/balance (`driver_wallet_screen.dart`) — transaction history, payout request +
    status, backed by the real `apps/api/src/modules/wallet` module — pre-existing.

## Built tonight

- **SOS button** (item 8) — [driver_common_widgets.dart](../../apps/mobile/smarttaxi_app/lib/features/driver/widgets/driver_common_widgets.dart)
  `DriverSosButton`/`_DriverSosSheet`, wired into the Line tab header
  (`DriverShiftHero.sosButton`) and the Trip tab header. Same
  `/api/regions/service-settings` `sosPhone` source and best-effort
  `submitSupportMessage(topic: 'SOS')` alert as the passenger side's `_SafetyButton`.
- **Waiting-for-passenger timer** (item 5) — `DriverWaitingTimerCard` in
  [driver_order_widgets.dart](../../apps/mobile/smarttaxi_app/lib/features/driver/widgets/driver_order_widgets.dart),
  shown on WAITING_CLIENT. Reads `waiting_started_at`/`free_waiting_until`/
  `waiting_price_per_minute` straight off the order (server sets these on the
  WAITING_CLIENT transition and bills from them at TRIP_COMPLETED — orders.routes.js),
  so the free/paid split can't drift from what actually gets charged.
- **Trip completion summary + passenger rating** (items 7, 9) —
  `DriverTripCompletionCard`, replaces the old bare "Готово" button. Shows price /
  service commission / driver payout (all from the finalized order, including any
  paid-waiting amount folded in server-side), then a stars + tags + comment rating of
  the passenger via new `ApiClient.rateClient()` → `POST /orders/:id/rate-client`.
- **Favorite / blocked client** (item 10) — same card, "В избранные" / "Не принимать"
  toggle buttons. New `ApiClient.getClientPreferences/setClientPreference/
  removeClientPreference` → `/api/favorites/clients` (GET/POST/DELETE), mirroring the
  existing `/api/favorites/drivers` (`DriverPreference`) shape exactly.
  New `ClientPreference` model in `features/shared/models.dart`.
- **Call button during navigation to pickup** (item 4 gap) — rider name + tappable
  "Позвонить" (`tel:` via `url_launcher`) added above the route fields on the Trip tab;
  previously the rider's phone number wasn't shown anywhere outside the open-order card.
- **Region-unavailable status pill** (item 1 gap) — the "На линии" status pill now shows
  a distinct "Недоступен по региону" (danger tone) when offline specifically because of
  `_disabledReason()` (missing docs / unapproved / blocked region), instead of the same
  plain offline pill used for a normal manual toggle-off.
- Shift earnings: looked at switching from `/drivers/me/stats` to the wallet module per
  the original ask. `revenueTotal` there is today's completed-trip revenue
  (`WHERE created_at >= date_trunc('day', NOW())`) off the same `driver.balance`/`debt`
  columns `wallet.routes.js` reads — it's already the correct "this shift" figure; the
  wallet module's `balance` is a different, cumulative concept and would be *less*
  correct here. Left as-is.

### Backend endpoints used that don't exist yet

`POST /orders/:id/rate-client` and `GET/POST/DELETE /favorites/clients` are being built
by a parallel backend session (per project notes) and return 404 today. Both mobile call
sites are best-effort: a failed request still lets the driver finish rating/dismissing
instead of getting stuck, so the UI is fully usable now and will start actually
persisting the moment those routes land — no mobile-side change needed then.

## Commits

- `Mobile: driver SOS button + commit previously-untracked widget split`
- `Mobile: free/paid waiting timer for the driver on WAITING_CLIENT`
- `Mobile: driver trip-completion summary, passenger rating, favorite/block client`
- `Mobile: call-passenger button during navigation + region-unavailable status pill`
- `Mobile: toast the driver when a price offer gets accepted/declined`
- `Mobile: fix price-offer UI leaking across drivers on shared open orders`
- `Mobile: confirm dialog before driver cancel/no-show`
- `Mobile: confirm dialog before driver logout`

## Additional fixes found via code review (no phone needed)

While waiting on device access, re-read the whole night's diff plus the surrounding
driver files and found two real issues, both fixed and screenshot/analyze-verified:

- **Cross-driver price-offer leak**: open orders are broadcast to every driver in a
  region, but `OrderCard` and the new accept/decline toast both read
  `order.driverOfferStatus` without checking `driverOfferByDriverId` — driver B's copy
  of an order driver A had offered on showed "Ожидаем ответа" for an offer B never
  made. Added `DriverStats.driverId` (was already in the `/drivers/me/stats` response,
  just never parsed) and scoped both call sites to it.
- **No confirmation before cancel/no-show/logout**: all three fired the API/logout
  immediately on a single tap. Added the same confirm-dialog pattern the passenger side
  already uses for its own cancel/logout actions.

## Next steps

1. Drive an actual trip (needs a second passenger-side account/order through real
   dispatch) to screenshot-verify the waiting timer, trip-completion/rating card,
   favorite/block buttons, and pickup call button — code-reviewed and analyze-clean,
   but not yet exercised live.
2. Once the backend session ships `/orders/:id/rate-client` and `/favorites/clients`,
   re-test the two flows end-to-end (they're wired correctly against the documented
   contract already, just untestable against a live 404).
3. A separate background task was spawned for the phone-number-field digit-scrambling
   bug found in the shared login screen (not driver scope) — see the chip in the
   session UI, or search project memory for "device-install-blocked" for repro steps.
