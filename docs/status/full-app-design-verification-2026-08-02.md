# Full-app design verification pass — 2026-08-02

Continuation of the screen-by-screen redesign sweep from the previous
session (passenger destination search + tariff sheets already done).
This round covered the remaining passenger screens, the entire driver
app, and a live check of all three web panels (client, driver, admin).
Found and fixed 2 real bugs in the passenger order-tracking flow along
the way; everywhere else confirmed the app already meets a high design
bar from the many prior redesign rounds (see `whole-app-polish-2026-07-30.md`
and earlier status docs) — no further changes were needed on those
screens.

## Bugs found and fixed

### 1. Stray "Маршрут водителя временно недоступен" banner on the trip-completion receipt

`_applyOrderSnapshot` in `passenger_shell.dart` called `_loadDriverRoute()`
unconditionally whenever `order.driverId != null` — which stays true for
the entire remainder of an order's life, including terminal states
(`TRIP_COMPLETED`, `PAYMENT_PENDING`, `PAID`, `RATED`). Once the trip
ends there is no more "route to pickup/dropoff" to track, so this kept
polling `driverToPickupRoute` on a finished order, got `ROUTE_UNAVAILABLE`
back, and rendered that as a red error banner on top of the receipt map —
confusing on a screen that has nothing to do with routing anymore.

Fixed by scoping the route fetch (and the error state that feeds the map
banner) to the actual en-route statuses (`DRIVER_FOUND` through
`TRIP_STARTED`/`IN_PROGRESS`), and clearing `_driverPickupRoute`/
`_driverRouteError` once the order leaves that set. Verified live: same
red banner reproduced before the fix (screenshot), gone after rebuild.

### 2. Blank "—" distance/duration on the receipt after a live order update

Same root cause as an address-placeholder bug fixed in the previous
session: the backend's `publicOrderEvent()` (the trimmed real-time socket
payload used for order-room broadcasts) omits `distance_km`/`duration_min`
entirely. The existing client-side backfill for that payload only
restored pickup/dropoff text and coordinates, not distance/duration — so
once a live status update landed (e.g. the `TRIP_COMPLETED` event), the
receipt's `_distanceLabel`/`_durationLabel` helpers saw `null` and
rendered "—" for both fields instead of the real trip stats.

Fixed by extending the same `raw.putIfAbsent(...)` backfill in both
`passenger_shell.dart` and `driver_shell.dart`'s `_handleOrderUpdate()` to
also cover `distance_km`/`duration_min` from the previously-known order.
Verified live: receipt showed "2.1 км · 8 мин" instead of "— · —" after
the fix.

Both fixes verified via a full API-driven order lifecycle
(search → accept → arrive → wait → start → complete → cash-confirm →
rate) walked live on-device for both the passenger and driver apps, with
the app rebuilt and reinstalled between the "before" and "after"
screenshots.

## Screens reviewed this round (no changes needed)

**Passenger secondary screens** — Мои поездки (+ trip detail), Уведомления,
Профиль, Кошелёк, Промокоды, Регулярные поездки, Избранные адреса,
Водители, Настройки. All already consistent: card-based layout, grouped
drawer sections, gradient CTAs, empty states with icon + copy, correct
debt/payout guard behavior.

**Driver app** — Линия (go-online flow, live stats), Заказы (incoming
order card), Поездка (accept → arrived → free-wait countdown → start →
complete → cash-confirm → rate-passenger, full progress stepper),
Навигатор (confirms the customer's original ask: own car icon on the map
instead of a generic marker, live speed readout), Кошелёк, Рейтинг. Full
order lifecycle re-verified end to end.

**Web panels** (local dev server against prod API, `smarttaxi-web-panels`
launch config) — client landing + order flow, driver login/dashboard/
earnings (`Доход` tab math cross-checked exactly against the mobile
wallet: 2 trips, ₸1,302 net, ₸98 commission), admin Control Center
dashboard (issue-prioritized health view) and Водители section. All
functional, consistent with the mobile design language, and correctly
enforce role-based access (driver account gets a clean "no access, log in
as owner/finance" screen on `/admin` rather than an error).

## Verification

- `flutter analyze`: clean, no issues.
- `flutter test`: 35/35 passing (updated one source-text assertion for
  the `_MapChromeButton` → `_UnifiedMapHeader` rename from the previous
  session; no other test changes needed).
- Full passenger + driver order lifecycle walked live on-device twice
  (once to catch the bugs, once after the rebuild to confirm the fix).
- Driver test account taken back offline and both device sessions
  restored to their normal logged-in state after testing.

## Not a bug (false leads ruled out)

- Driver avatar rendering as a solid black square on the trip-detail
  screen: confirmed via direct fetch of the avatar URL that the seeded
  test driver's actual uploaded photo is a genuinely solid-black JPEG
  (leftover fixture from earlier avatar-upload testing this session) —
  the app is correctly rendering the real photo it was given, not a
  broken-image bug.
