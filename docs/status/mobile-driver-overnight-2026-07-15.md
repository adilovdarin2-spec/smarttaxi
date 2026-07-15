# Mobile driver overnight — 2026-07-15

Scope: `apps/mobile/smarttaxi_app/lib/features/driver/**` and directly related shared
models/API client methods. Passenger side (`lib/features/passenger/**`) was being worked
by a parallel session and was not touched, per instructions.

## Verification status (read this first)

**On-device screenshot verification was blocked all night.** `flutter install` /
`adb install` to the connected phone (`2409BRN2CY`, serial `IBOVEMHQBQBQMJTS`) fails
consistently with `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`. Confirmed
this isn't the lock screen or a stale adb daemon (`dumpsys power`/`dumpsys window` show
the screen awake and unlocked; restarting `adb` didn't help) — it needs a manual tap on
the phone itself, most likely MIUI's separate "Install via USB" toggle under Developer
Options → Security settings, which silently re-locks and can't be flipped remotely.

Everything below is **code-complete and `flutter analyze`-clean, but not yet confirmed
working on an actual device/screen**. Please unlock "Install via USB" on the phone and
ask for a follow-up pass to screenshot-verify each item before treating this as done.

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

## Next steps

1. Unlock "Install via USB" on the phone, install the current build, and screenshot-walk
   every item above (Line tab SOS + region pill, incoming order, price offer, navigation
   call button, waiting timer free→paid transition, trip completion card, rating submit,
   favorite/block toggle) before calling any of it done.
2. Once the backend session ships `/orders/:id/rate-client` and `/favorites/clients`,
   re-test the two flows end-to-end (they're wired correctly against the documented
   contract already, just untestable against a live 404).
