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

## Round 2 — urgent P1/P2 rework (requested after seeing "На линии" live)

The user looked at the running app and flagged the Line tab region display, the
disabled-reason messaging, and the in-shell "Навигатор" tab as genuinely bad. Rebuilt
all three, verified live on-device (`+77000000000` / `123456`), screenshots in
`docs/status/screenshots/2026-07-15-overnight/`.

### P1 — "На линии" region card + disabled-reason banners + full visual QA

**Before:** plain text region row, a system `DropdownButton` to change it, and
`_disabledReason()` rendered as a single generic line with no icon/action — easy to
miss why the toggle was greyed out. `DriverStatsGrid`/quick-actions used
`CrossAxisAlignment.stretch` inside a `ListView`-nested `Row`, which — although it
happened not to crash on this exact data shape at the time — is the same layout pattern
that did crash elsewhere this session (see [[reference_flutter_blank_screen_debugging]]).

**After** (`p1-line-tab-after.png`, `p1-region-picker.png`):
- `DriverShiftHero` redesigned: driver name, region chip with a chevron (tap → bottom
  sheet), SOS button, then a colored-dot status row + today's earnings, then a single
  full-width CTA (`DriverGradientButton` offline / `OutlinedButton` online).
- Region chip opens `_showRegionPicker()` — a bottom sheet (`_RegionPickerRow` list)
  with a colored `StatusPill` per region (Одобрен/Заблокирован/Отключён/На
  рассмотрении) and a checkmark on the active one. Confirmed live: shows "Асыката"
  selected with a green "Одобрен" pill, full scrollable list of other approved regions.
  Per [[project_driver_region_list_always_approved]] the backend only ever returns
  approved+active regions today, so the non-green badge branches are defensive/inert
  until that filter loosens — left in since the picker already handles it correctly.
- `_disabledReason()` (still used for the actual toggle-disable gate) now has a
  structured twin, `_availabilityIssue()` → `_DriverIssueBanner`: icon + title + message
  + an optional action button, one card per state (no approved regions, no region
  selected, missing docs, region inactive, region blocked, pending approval). Confirmed
  live: "Нужны документы" banner renders with the document icon, correct count copy
  ("Ещё 5 обязательных документа(ов) не загружено..."), and a "Загрузить документы"
  button.
- `DriverStatsGrid` replaced with `DriverTodayStrip` (3 tiles, wrapped in
  `IntrinsicHeight` instead of `stretch` — the crash-safe pattern). Confirmed live, no
  text truncation ("Норма" for demand, was "Обычн..." before).
- Title truncation fix: header now shows the driver's own name instead of a static
  "Водитель SmartTaxi..." label that was clipping next to the logo + SOS icon.

### P2 — Navigator as a dedicated full-screen route

**Before:** "Навигатор" was `_tab = 3` in the same `IndexedStack` as Line/Orders/Trip —
shared bottom nav bar, no dedicated back affordance, camera didn't auto-follow, no
GPS-lost state, external-map-app buttons (2GIS/Yandex/Google) still present.

**After** (`p2-navigator-fullscreen.png`): tapping "Навигатор" now calls
`_openFullScreenNavigator()`, pushing `_DriverFullScreenNavigator` via
`Navigator.push` — a real full-bleed route, no bottom nav bar, with:
- Top-left circular back button (confirmed live: tap returns cleanly to the Line tab,
  not just a system-gesture-only back).
- Top-right voice-toggle + report-road-alert circular buttons.
- Course-up camera auto-follow (`moveAndRotate` on a 350ms position poll) that
  disengages the moment a real user pan is detected (fixed an allow-list bug this round
  — see commit `274e8d1` — where the map's own initial layout event was
  misclassified as a manual pan and showed the recenter FAB immediately on open;
  confirmed live post-fix: FAB does **not** appear on open, only after an actual drag).
- Maneuver banner and voice/GPS-status banner in separate vertical zones so they never
  overlap.
- `_GpsSearchingBanner` for lost/stale (>12s) fixes — confirmed live: "Ищу сигнал
  GPS..." renders correctly with no self-location marker while indoors/no-fix.
- Bottom strip: `_NavTargetStrip` (distance/ETA once a route exists) + speed/limit
  cockpit (shows "--" placeholders correctly when speed/limit are unknown).
- 2GIS/Yandex/Google "open in external app" buttons and their deep-link handlers
  (`_openNavigator`, `_openExternalUrl`, `_navigatorUrls`, the navigation
  `MethodChannel`) removed entirely per explicit request — the app now only offers its
  own in-app turn-by-turn.

**Not exercised**: real GPS movement (this test account/device had no outdoor fix
during this pass, so the self-location marker's heading-rotation and camera-follow
were verified via code + the existing pre-session screenshot evidence, not a live
moving trace). Static verification (open → GPS-lost banner → back) is real and live.

### Commits (round 2)

- `Mobile: redesign region display + structured disabled-reason banners on Line tab`
  (P1 — region bottom-sheet picker, `_DriverIssueBanner`, `DriverTodayStrip`,
  `IntrinsicHeight` crash fix, title/demand-label truncation fixes)
- `Mobile: navigator as a dedicated full-screen route`
  (P2 — `_DriverFullScreenNavigator`, camera auto-follow/recenter, maneuver/GPS zone
  separation, bottom target+speed cockpit)
- `Mobile: remove 2GIS/Yandex/Google external navigator buttons`
- `274e8d1` — fix recenter FAB appearing immediately on navigator open (allow-list
  fix for `_handleMapEvent`), verified live post-rebuild in this pass.

## Round 3 — final consistency pass

Walked the entire driver experience end-to-end against the visual language established
in round 2 (`DriverGradientButton`/`DriverPressScale`, `IntrinsicHeight`-safe rows,
`_DriverIssueBanner`-style structured banners, `StatusPill` badges). Order
card/price-negotiation/waiting/trip/completion/rating/favorites/wallet/SOS were all
reviewed by reading the current code end to end (not just the diff from tonight); Line
tab, drawer navigation, and Navigator were additionally re-verified live on-device.

### Found and fixed

- **Real crash, found live**: the drawer's "Smart Navigator" item still called
  `setState(() => _tab = 3)` directly instead of routing through
  `_openFullScreenNavigator()` — a leftover from before Navigator became a pushed route.
  `IndexedStack` now only has 3 children (line/orders/trip), so this threw a
  `RangeError` the moment the drawer item was tapped. The bottom `NavigationBar` had
  already been fixed for this in round 2; the drawer callback was a second, separate
  code path that got missed. Fixed by mirroring the same guard in
  `DriverDrawer.onTab`. Verified live: tapping "Smart Navigator" in the drawer now opens
  the full-screen navigator cleanly, no crash.
- **CTA hierarchy inconsistency**: several standalone, single-action primary buttons
  were still on the plain Material `ElevatedButton` left over from before
  `DriverGradientButton` existed, while sibling screens (shift toggle) already used it —
  visually these read as a lower-tier action even though they're each the single most
  important button on their screen:
  - Price-offer sheet's "Отправить предложение".
  - Trip-completion card's closing "Готово".
  - Wallet screen's "Запросить выплату" and the payout-request sheet's submit button.
  - **Trip tab's main status-action button** ("Я на месте" / "Начать поездку" /
    "Завершить поездку" etc.) — arguably the single most-pressed button in the whole
    driver flow, and it wasn't even wrapped to full width, unlike every other primary
    CTA on that screen. This was the most visible instance of the "на скорую руку" feel
    the user flagged, just on a screen that needs an active order to see live.
  All five switched to `DriverGradientButton`, preserving their exact enable/loading
  logic. Two-button rows (Accept/Reject, rating submit+skip, favorite/block) were
  deliberately left on Material buttons — that pairing is a distinct, already-consistent
  pattern elsewhere (`OrderCard`, recurring-booking accept/decline), and forcing gradient
  onto every button in the app would flatten the visual hierarchy rather than fix it.
- Verified live post-fix: wallet's "Запросить выплату" now renders in the same
  blue→gold gradient as the shift-toggle CTA (shown disabled/50%-opacity here since
  balance is 0 ₸ under the 3 000 ₸ minimum — correct, not a bug); Line tab and
  full-screen Navigator both still open and close cleanly after all of tonight's builds.

### Reviewed, no changes needed

`DriverWaitingTimerCard`, `DriverTripCompletionCard`'s summary rows, `OrderCard`,
`DriverRatingScreen`, `DriverTripHistoryCard`, `DriverDocumentsScreen`, SOS sheet — all
already use `PremiumCard`/`StatusPill`/`context.palette` tokens consistently and were
built or last touched with the same design language; no `CrossAxisAlignment.stretch`
inside unbounded-height containers found outside the two known-safe spots (both
reviewed and confirmed not the crash pattern: one is `IntrinsicHeight`-wrapped, the
other is a `Positioned`-bounded `Column` where stretch only affects width, not height).

### Not exercised live (needs a real order, out of reach solo)

Order card, price negotiation, waiting timer, trip-completion/rating, favorite/block —
same limitation as round 1: these only render once an order is assigned, which needs a
second passenger-side account placing a real order through dispatch. Code-reviewed and
`flutter analyze`-clean; the CTA fixes above were verified structurally (button
enable/loading logic re-derived and checked against the original conditions) rather than
by tapping through a live order.

### Commits (round 3)

- `Mobile: fix drawer Smart Navigator crash (IndexedStack had only 3 panes)`
- `Mobile: use DriverGradientButton for price-offer + trip-completion CTAs`
- `Mobile: use DriverGradientButton for wallet payout CTAs`
- `Mobile: make the Trip tab's main action button a full-width DriverGradientButton`

### Control pass

Re-read every file touched across rounds 2–3 once more after the last commit above
(`driver_shell.dart`, `driver_line_widgets.dart`, `driver_order_widgets.dart`,
`driver_common_widgets.dart`, `driver_wallet_screen.dart`,
`driver_payout_request_sheet.dart`) and re-ran `flutter analyze` — clean, only the same
4 pre-existing unrelated warnings in `passenger_shell.dart`/`main.dart` (outside driver
scope, not touched tonight). No further discrepancies found. Everything reachable
without a live order (Line tab, region picker, disabled-reason banners, drawer, Navigator,
wallet, SOS) has been screenshotted on-device this round; everything that needs an active
order remains the one open item for a future session with a second test account.

## Round 4 — removed the driver-document requirement entirely (explicit request)

User instruction, verbatim: "не проси документы у водителей так как это затруднит
регистрацию и людям это не понравится" (don't ask drivers for documents, it complicates
registration and people won't like it), followed by "работай дальше без телефона"
(continue without the phone) — so this round is code-reviewed and `flutter
analyze`/smoke-test verified, **not** screenshotted on-device (no phone available this
round).

This reverses a same-night change from the parallel backend session (see
`docs/status/server-overnight-2026-07-15.md` §8, commit `fix(drivers): block
undocumented drivers from all dispatch paths`), which had wired
`getMissingRequiredDocumentTypes` into `assertDriverRegionApproved`/
`assertDriverDispatchReady` so a driver with an approved region but an unapproved
license/ID/vehicle-registration document set still couldn't go online
(`403 DRIVER_DOCUMENTS_NOT_APPROVED`). Flagging this explicitly since it's a real
passenger-safety/verification tradeoff, not just a UI tweak — the product call to drop
it was made directly by the user, not inferred.

**Backend** (`apps/api/src/modules/driver-region-approvals/driver-region-approvals.service.js`):
removed `assertDriverDocumentsApproved` and both call sites (`assertDriverRegionApproved`,
`assertDriverDispatchReady`). Going online / receiving dispatch now only depends on
region approval status and `is_blocked`, same as before documents were wired in as a
gate. Updated `apps/api/src/tools/driver-approval-check.js` to match — removed the
"CRITICAL: a driver without approved required documents cannot go online" test block and
its now-unused `driverDocuments` mock state/SQL handler. Re-ran `node
src/tools/driver-approval-check.js` and `node src/tools/driver-documents-check.js`
directly — both pass; `driver-documents-check.js` still covers
`getMissingRequiredDocumentTypes` itself (untouched, just no longer wired into the
online-gate), confirming the document upload/admin-review feature is intact, only the
enforcement is gone. `node src/tools/api-check.js` also ran clean through the
"Driver region approval checks ok" line; it does fail later on an unrelated admin-panel
copy assertion ("Admin shell missing honest state copy: Пока нет обращений") that traces
to `apps/api/public` admin shell content, not touched by this change or anything in
driver scope tonight — looks like a parallel session's admin-panel work mid-flight.

**Mobile** (`driver_shell.dart`): removed `_driverDocuments`/`_driverDocumentsLoaded`
state, `_loadDriverDocuments()`, and the `_missingRequiredDocuments` getter entirely —
they only existed to mirror the now-removed backend gate as an advisory pre-check.
Removed the "Нужны документы" blocking branch from both `_disabledReason()` (toggle-
disable gate) and `_availabilityIssue()` (the P1 structured banner). Updated copy that
pointed at document upload as the path to region approval — there never was a
self-service "apply for region" flow in this codebase (region approval is admin-only,
see [[project_driver_region_list_always_approved]]) — the "Нет одобренных регионов" and
the online-toggle's approval-rejection catch block now point at "Написать в поддержку"
instead of opening the documents screen. The "Заявка на рассмотрении" message no longer
tells drivers to double-check their documents. The document upload screens themselves
(`DriverDocumentsScreen`, the onboarding `driver_application_documents_screen.dart`,
which already had a "Later"/skip option) are untouched and still reachable from the
drawer for any driver who wants to submit documents voluntarily — only the mandatory
gate and all messaging that implied it was mandatory are gone.

`flutter analyze lib/features/driver` clean after the change (one `unused_import` for
the now-dead `models/driver_document_models.dart` import, removed).

### Commit (round 4)

- `Stop requiring driver documents to go online (per explicit request)`

### Not verified this round

No on-device pass — per explicit instruction to work without the phone. Next session
with device access should confirm live: the Line tab never shows "Нужны документы"
regardless of document state, the shift toggle is only gated by region
approval/selection, and the "Нет одобренных регионов" banner's "Написать в поддержку"
action opens the support sheet correctly.

## Round 5 — control pass, no phone available

`adb devices` returned an empty list this round (phone off USB, consistent with earlier
in the night — see [[reference_device_install_blocked]]) — no live re-verification
possible. Did what's checkable without the device:

- **Prod deployment gap re-checked, still open**: curled the deployed Railway backend
  directly (`https://smarttaxi-api-production.up.railway.app`). `/api/health` returns
  `200` (base connectivity fine), but `/api/orders/:id/rate-client`,
  `/api/favorites/clients`, `/api/recurring-bookings/mine`, and
  `/api/orders/:id/quick-message` all still return `404` — same gap documented
  previously (see [[project_prod_backend_deployment_gap]]), unchanged since the last
  check. All four routes exist in the local repo (`orders.routes.js:599`,
  `favorites.routes.js:193-231`) — this is a stale prod deploy, not a regression
  introduced tonight. Nothing to fix on the mobile/driver side for this; noting it here
  so a future session doesn't re-diagnose the same gap from scratch.
- Re-read the driver-scope diff from rounds 1–4 once more for anything overlooked before
  a device was available to screenshot it. No new inconsistencies found — this control
  pass found nothing new.

No code changes this round.

## Round 6 — phone reconnected: confirmed round 4 live, found and fixed a real silent-failure bug

Phone (`IBOVEMHQBQBQMJTS`) came back on USB. Rebuilt and installed the round-4
document-requirement-removal commit (`fdbc214`, never live-verified before this round)
and confirmed on-device:

- **"Нужны документы" banner is gone**, shift toggle status pill reads neutral "Не на
  линии" instead of the red "Недоступен по региону", and the toggle is fully enabled
  (blue gradient, not greyed) — matches the round-4 diff exactly.

Then tapped "Выйти на линию" to actually exercise it end-to-end against the prod
backend, and found a real bug: **the toggle silently reverts to offline with zero
visible feedback** — no error banner, no toast, nothing — after a few seconds of
"Обновляем статус...". Root cause, confirmed via read-only GETs against prod (did **not**
attempt the mutating status PATCH directly — that's correctly gated behind explicit
user confirmation per this session's safety rules, so this was diagnosed from
`GET /api/drivers/me/documents` returning `{"documents":[]}` for this driver, combined
with the already-documented prod deployment gap):

- This driver has zero uploaded documents.
- Prod Railway almost certainly hasn't picked up this repo's backend-side "stop
  requiring driver documents" change yet (same deployment-gap pattern documented in
  round 5 for other routes) — meaning `PATCH /api/drivers/me/status` on prod likely still
  throws `403 DRIVER_DOCUMENTS_NOT_APPROVED`.
- Round 4's mobile fix removed `DRIVER_DOCUMENTS_NOT_APPROVED` from the client's
  `approvalCodes` set (reasoning: the backend in *this repo* can no longer emit it) — so
  when prod throws it anyway, the mobile app no longer recognizes it as an actionable
  approval block. It falls through to the generic inline-`_error` path instead of the
  toast + support-sheet treatment — and, going by what actually rendered on screen, that
  path is producing no visible output at all for this specific case.

**Fix** (`driver_shell.dart`, `models/driver_shell_helpers.dart`): re-added
`DRIVER_DOCUMENTS_NOT_APPROVED` to `_setOnline`'s `approvalCodes` set (with a comment
explaining it's for a not-yet-updated backend, not a reintroduction of the client-side
gate) and added a `readableError` mapping for it, so hitting this on a stale backend
now shows a clear toast ("Сервер ещё требует проверку документов — обратитесь в
поддержку") and opens the support sheet, same as the other approval-block codes,
instead of silently doing nothing.

**Not fully verified**: the phone disconnected from USB (`adb devices` went empty)
right after rebuilding this fix, before it could be reinstalled and the toggle
re-tapped to confirm the toast now appears. `flutter analyze lib/features/driver` is
clean. Next session with device access: rebuild, install, tap "Выйти на линию" on this
same test account, and confirm the toast + support sheet now appear instead of a silent
revert.

### Commit (round 6)

- `Mobile: handle stale-backend DRIVER_DOCUMENTS_NOT_APPROVED gracefully`

## Round 7 — no phone this round, static control pass

Explicit instruction to continue without the phone (`adb devices` stayed empty the
whole round — the USB disconnect from the end of round 6 didn't clear). Did what's
safely checkable without it:

- Re-read the round 6 diff (`97c6e9a`) end to end once more — the fix is minimal (one
  set entry + one map entry, both purely additive) and correct on inspection: no other
  approval-style code filtering exists in `driver_shell.dart` besides the one
  `approvalCodes` set already fixed, so there's no sibling instance of the same
  "code removed from client but a stale backend can still emit it" mistake elsewhere in
  driver scope tonight.
- Checked the profile screen's static `driverProfileDocumentsNote` copy ("Документы
  автомобиля и допуск к регионам проверяет администратор SmartTaxi") against the
  document-requirement removal — it's still accurate (documents are still
  admin-reviewed if voluntarily submitted; only the online/dispatch *gate* was removed),
  no change needed.
- Re-ran the two backend self-contained checks touched by round 4 directly with `node`
  (no live DB needed, they use an in-memory mock executor): `driver-approval-check.js`
  → "Driver region approval checks ok"; `driver-documents-check.js` → "Driver documents
  checks ok". Both still pass.
- `flutter analyze lib/features/driver` → clean, no issues.

No code changes this round — nothing new found, and the one open item (live-verify the
round 6 toast) still needs the phone. Not attempting the mutating `setDriverStatus`
PATCH directly against prod to work around the missing phone — that's correctly outside
what a curl-based static-verification round should do; it stays a UI-only check for
whenever the device reconnects.

## Round 8 — still no phone, traced the "less registration friction" ask to its root

Kept digging statically into whether document requirements create friction anywhere
else in the driver registration path, beyond the already-fixed online/dispatch gate:

- **`DriverApplicationDocumentsScreen`** (`screens/onboarding/
  driver_application_documents_screen.dart`) — this is the document-upload step shown
  right after a "become a driver" application, but it's pushed from
  `passenger_shell.dart` (out of driver scope, not touched). Confirmed it was already
  non-blocking before tonight: its bottom button always pops the screen
  (`Navigator.of(context).pop()`) regardless of upload state — "Готово" if all required
  types are uploaded, "Later"/skip otherwise either way. No fix needed here.
- **`POST /admin/driver-applications`** (`apps/api/src/modules/admin/admin.routes.js:1253`,
  the actual application-submission endpoint) — checked its Zod schema: only
  `fullName`/`phone`/`carModel`/`plateNumber`/`year`/`comment`. No document field, no
  document check, ever. This endpoint has never gated registration on documents; the
  *only* document-related friction that ever existed was the now-removed online/dispatch
  gate from round 4.
- **Found and fixed a stale comment** (`apps/api/src/modules/driver-documents/
  driver-documents.service.js:23-24`): `REQUIRED_DOCUMENT_TYPES`'s comment still said
  "before they're allowed to actually work," describing the enforcement round 4 removed.
  Updated it to say the list/check are still used for admin review/reporting only, not
  wired into any gate — a future reader (this session or the parallel backend one)
  shouldn't be misled into thinking the block still exists from reading this file alone.
  Re-ran `node src/tools/driver-documents-check.js` after the comment-only edit — still
  "Driver documents checks ok".
- Grepped all of `driver_shell.dart`'s `catch (_)` blocks for other silent-failure
  patterns like the one fixed in round 6 — every one either has an explanatory
  "best-effort" comment or a `setState` that surfaces something to the user
  (`_error`/`_locationMessage`/`_navigatorMessage`). No sibling bug found.

### Commit (round 8)

- `Backend: fix stale comment claiming documents still gate going online`

## Round 9 — still no phone (3 spaced retries, none succeeded)

Same standing instruction fired again; `adb devices` came back empty on 3 retries
spaced ~5–10s apart, then stopped per the "don't tight-loop" rule. Rounds 7–8 already
did the available static work for this exact ask (control pass, tracing the
registration-friction request to its root, the stale-comment fix) — nothing further to
add without repeating what's already written above. No code changes this round. The
one open item is unchanged: live-tap "Выйти на линию" once the phone reconnects and
confirm the round 6 toast/support-sheet appears instead of a silent revert.

## Round 10 — still no phone, reviewed every remaining unread driver file

3 more spaced `adb devices` retries, still empty. Rather than repeat rounds 7–9's
analysis, read every driver-scope file that hadn't been opened yet this session:
`widgets/driver_shell_chrome.dart` in full (`DriverHeader`/`DriverDrawer` — no issues;
noted but not touching a pre-existing, broad mix of hardcoded-Russian and l10n-routed
drawer labels, since that predates tonight and fixing it wholesale wasn't asked for),
the `_RoadAlertsSheet` inline class in `driver_shell.dart` (road-alert submit/confirm/
dismiss flows — every error path sets a visible `_message` via `InlineMessage`, no
silent-failure pattern like round 6's), and the small model files
(`driver_document_labels.dart`, `driver_document_models.dart`). No new issues found in
any of them. No code changes this round — every driver-scope file has now been read at
least once this session. Still waiting on the phone for the one open item (round 6's
toast).

## Round 11 — no changes, phone unavailable (3 spaced retries)

## Round 12 — phone connected but screen-locked (real keyguard, not touched)

`adb devices` shows the phone connected, but `isKeyguardShowing=true` (a real PIN/
biometric lock, confirmed via `dumpsys window`) — this blocks `adb install` the same
way `INSTALL_FAILED_USER_RESTRICTED` does (the install-confirmation dialog can't
render/be accepted over a locked screen). Not attempting to bypass a lock screen —
watching for it to clear (it does once the user next touches the phone, per
[[reference_device_install_blocked]]) rather than polling in a tight loop.

## Round 13 — monitor timed out, phone fully disconnected again

The keyguard-clear monitor from round 12 timed out after 10 minutes without unlocking;
`adb devices` now shows a full USB disconnect (not just locked) — same pattern as
earlier in the night. No changes this round.

## Round 14 — root-caused the persistent install block: MIUI "Install via USB" toggle

Phone connected and unlocked this round, but `adb install` still fails with
`INSTALL_FAILED_USER_RESTRICTED` on repeated attempts. Checked further this time:
`kz.smarttaxi.app` is not installed on the device at all anymore (`adb shell pm list
packages -3` doesn't list it — confirmed this is the user's real personal phone,
WhatsApp/TikTok/games etc., not a dedicated test device, so someone/something
uninstalled our test build at some point tonight). Generic Android install-restriction
settings are already permissive (`verifier_verify_adb_installs=0`,
`install_non_market_apps=1`) — this is specifically MIUI's separate "Install via USB"
toggle (Settings → Additional settings → Developer options → Security → Install via
USB), which lives outside the standard `settings` content provider and can't be flipped
via adb. Flagged this to the user directly and asked whether to keep auto-retrying
periodically or wait for them to toggle it manually — no response yet this round.
No code changes. The round 6 fix is unchanged and ready to verify the moment install
succeeds.

## Round 15 — found and fixed a genuinely broken test suite (no phone needed)

Since "работай без телефона" ruled out install retries, ran `flutter test` for the
first time this session as a different angle for finding real, non-cosmetic issues.
`test/widget_test.dart` (the only test file in the app) does source-text assertions —
`expect(fileContents, contains('SomeString'))` — as a lightweight regression guard.
**5 of the ~10 failing tests were driver-scope**, and every one was a real, silent
break: string/class-name checks for things that had moved to extracted widget files
(`driver_line_widgets.dart`, `driver_order_widgets.dart`, `driver_common_widgets.dart`,
`models/driver_shell_helpers.dart`) or migrated to `AppLocalizations`/`app_ru.arb`
(mostly pre-existing drift, predating tonight), plus checks for things tonight's
rounds legitimately removed (`_DriverStatsGrid`/`_DriverQuickActions` → merged into
`DriverTodayStrip`; `_navigatorTab`/`_NavigatorCockpit` → replaced by the pushed-route
`_DriverFullScreenNavigator`; the `2GIS`/`Yandex`/`Google` buttons). No CI runs this
suite (no `.github/workflows`), so nobody would have noticed short of running
`flutter test` by hand — which is presumably why it had drifted this far.

Rewrote every driver-scope assertion to check the file it actually lives in now (or
the `.arb` source of truth for l10n-migrated copy), and turned the 2GIS/Yandex/Google
checks into `isNot(contains(...))` guards so the explicit removal can't silently
regress. Left the 4 still-failing passenger-scope tests and the shared "official
icon-only logo asset is wired" test (branding/pubspec assets) completely untouched —
both trace to the parallel session's passenger/branding work, not this session's
scope. `flutter test` now shows all driver-scope tests passing; `flutter analyze
test/` clean.

**Minor finding, since removed (round 16 below)**: `RegionSummary` (widget class in
`driver_line_widgets.dart`) was defined but never instantiated anywhere in the driver
tree anymore — genuinely dead code left over from the P1 region-picker rework
replacing it with the bottom-sheet picker.

### Commit (round 15)

- `test: fix all driver-scope widget_test.dart assertions to match current code`

## Round 16 — swept for other dead public widgets, removed the one found

Followed up on round 15's `RegionSummary` finding: since it's a public class (no
underscore), `flutter analyze`'s `unused_element` lint doesn't catch it (that lint only
fires for private declarations). Wrote a quick grep sweep counting `ClassName(`
occurrences for every public class across all driver widget files
(`driver_line_widgets.dart`, `driver_order_widgets.dart`, `driver_common_widgets.dart`,
`driver_profile_widgets.dart`, `driver_shell_chrome.dart`) — a count of 1 means only the
constructor declaration matches, i.e. never actually instantiated. `RegionSummary` was
the only one; every other public widget in these files has at least one real call site.
Removed `RegionSummary` (51 lines). `flutter analyze lib/features/driver` and
`flutter test` both clean afterward — same 5 pre-existing non-driver failures as round
15, no new ones.

### Commit (round 16)

- `Mobile: remove dead RegionSummary widget`

## Round 17 — dart fix --dry-run: zero driver-scope suggestions

Ran `dart fix --dry-run` (not `flutter pub run dart fix`, which mis-resolves "dart" as
a package name under this Flutter SDK layout — use the bundled `dart` executable
directly) across the whole app as one more static-analysis angle. Only 2 proposed
fixes total, both `unused_element_parameter` in `passenger_shell.dart` and `main.dart`
— the same pre-existing, out-of-scope warnings noted all session. Zero suggestions
anywhere in `lib/features/driver/**`. Combined with round 15's `flutter test` fix and
round 16's dead-widget sweep, this closes out the practical static-verification angles
available without the device.

## Round 18 — ran every remaining backend check script, all clean; new install idea

Ran every driver-related backend self-check script not yet run this session
(`driver-rating-summary-check.js`, `driver-wallet-check.js`, `order-lifecycle-check.js`,
`regions-check.js`, `road-alerts-check.js`, `tariffs-orders-check.js`,
`admin-tariffs-check.js`, `order-create-contract-check.js`) — all pass. The one
failure, `stage11-driver-core-smoke.js` ("fetch failed"), is expected and not a
regression: unlike the `-check.js` scripts (self-contained mock executor, no server
needed), every `-smoke.js` script explicitly requires a live `npm run dev` server
against a seeded DB (confirmed by reading their header comments) — unavailable per
[[reference_local_backend_env]]. This closes out the backend-side static verification
available tonight; everything reachable without a live server or the phone is green.

Also tried a different install mechanism this round: `adb push` the APK to
`/sdcard/Download/` and trigger the device's own package-installer UI locally instead
of `adb install`'s streaming path — this uses a different Android permission gate and
might not be blocked by the same MIUI "Install via USB" toggle. Device disconnected
mid-attempt before this could be tested; worth trying again next time the phone is
back (`adb push <apk> /sdcard/Download/smarttaxi-driver.apk`, then either wait for the
user to tap it in Files, or trigger the installer intent via `adb shell am start -a
android.intent.action.VIEW -d file:///sdcard/Download/smarttaxi-driver.apk -t
application/vnd.android.package-archive` — note this may itself need "install unknown
apps" permission granted to the Files app specifically, a separate toggle from
Install-via-USB).

## Round 19 — device still down, install-workaround untested (no device to try it on)

`adb devices` empty on 2 spaced checks — could not attempt the round 18 push-based
install idea since there's no device to push to. No new static analysis attempted
(rounds 15-18 already covered flutter test/dead-code/dart fix/backend checks). No
changes this round.

## Round 20 — self-directed "make it ideal" pass (no phone, no user check-ins)

User explicitly handed over the quality bar: keep working, be the judge myself, don't
stop until the driver part is ideal by my own standard, then report what was done.
Went beyond bug-hunting into deeper quality dimensions not yet checked this session:

- **Memory-leak / dispose() audit** (full sweep of every State class in
  `lib/features/driver/**`, all `TextEditingController`/`Timer`/`StreamSubscription`/
  `AnimationController`/`MapController` instances): clean. Every resource a State
  class owns is released in `dispose()`, `super.dispose()` always called last. Two
  un-cancellable one-shot `Timer`s in `_DriverShellState` (`_showNavigatorBanner`,
  `_checkSignProximity`) are benign — short-lived, `mounted`-guarded, not stored in a
  field so nothing to leak.
- **Kazakh (`app_kk.arb`) localization completeness for driver strings**: 162/162 key
  parity with `app_ru.arb`, zero missing. Spot-checked the 10 keys where the Kazakh
  value is byte-identical to Russian — all genuine shared loanwords (Баланс, Файл,
  Тариф, Навигатор, Аккаунт, Интерфейс, Рейтинг, Геолокация, Фото) rather than lazy
  copy-paste; the other 152 keys have distinct Kazakh translations. Clean.
- **Design-system deviation found, not fixed (shared-file blast radius)**:
  `docs/design/BLUE_WHITE_DESIGN_SYSTEM_2026-07-15.md` specifies `warning` as a
  distinct amber/gold hue (`#C98A12` light / `#E0A93A` dark), explicitly separate from
  `accent`, and says "never repurpose accent for status." `SmartTaxiColors.warning` /
  `SmartTaxiPalette.warning` in `core/theme/app_theme.dart` is currently blue
  (`0xff0b66d8`) — used by driver code for road-hazard map-icon colors and the
  `StatusTone.warning` StatusPill tone (e.g. a pending payout request). Did **not**
  fix: `SmartTaxiColors.warning` is also read directly by
  `passenger_shell.dart:7072`, so changing the shared token would touch passenger
  rendering — out of this session's scope and blast radius. Documented here instead of
  silently editing a shared file the parallel session owns.
- **Dead-code sweep, one more pass**: confirmed (via a grep counting `ClassName(`
  occurrences for every public class across all driver widget files) that
  `RegionSummary` (removed round 16) was the only genuinely-unused public widget;
  every other public class has ≥1 real call site beyond its own constructor.
- **Accessibility: found and fixed 3 real gaps**, all icon-only tap targets with no
  text sibling — a screen reader (TalkBack/VoiceOver) would announce each as an
  unlabeled "button" with zero context:
  - `_NavCircleButton` (back/voice-toggle/report-alert/recenter in the full-screen
    navigator) and `_MapChipButton` (road-alerts chip on the Line tab map) — added a
    required `semanticLabel` wrapped in `Semantics(button: true, label: ...)` at every
    call site. The back button is the *only* non-gesture way out of the full-screen
    navigator route, so this one mattered most.
  - `DriverSosButton` — a safety-critical control with zero label. Added
    `Semantics(button: true, label: 'Экстренная помощь', ...)`.
  - `_DriverStarSelector` (passenger-rating stars on `DriverTripCompletionCard`) — 5
    identical unlabeled icon buttons in a row, no way to tell which star or the
    current rating. Added a per-star `Semantics(label: 'Оценка: N звёзд/звезды',
    selected: ...)`.
  - Checked every other `InkWell`/`GestureDetector` in the driver widget files
    (`DriverGradientButton`, `_DriverSosRow`, the region-name tap row in
    `DriverShiftHero`, `_DriverTagChip`, `DriverSupportTopicChip`, `DriverFaqTile`,
    `DriverSettingsRow`, `DrawerItem`) — all have a visible `Text`/`ListTile.title`
    sibling a screen reader already reads, so no fix needed there.
- `dart format` was run on `driver_shell.dart` while fixing the navigator buttons
  (the file had drifted out of formatting-compliance across many rounds of hand-edits
  tonight) — purely mechanical, `flutter analyze`/`flutter test` identical before and
  after, but made that one commit's diff larger than the semantic change alone; noted
  in the commit message so it doesn't read as a bigger behavioral change than it is.
- `flutter analyze lib/features/driver` and `flutter test` re-run after every edit
  this round: clean throughout, same 5 pre-existing non-driver test failures
  (passenger scope + shared branding-asset test) as rounds 15–19, no new ones.

### Commits (round 20)

- `Mobile: add screen-reader labels to icon-only navigator buttons`
- `Mobile: add screen-reader labels to SOS button and star rating`

### Honest status: what "ideal" means without a working device

Everything above was verified through code reading, `flutter analyze`, `flutter test`,
and grep-based cross-checks — no on-device rendering was possible (`adb devices` empty
all round). I'm confident in the correctness of every change (each is small, each was
analyze/test-verified, none touches passenger scope or shared theme tokens). What I
cannot personally claim is having *seen* any of tonight's driver screens rendered — the
accessibility labels, in particular, can only be truly confirmed by pairing a real
screen reader with the device, not by reading the Semantics tree in source. Per
[[feedback_screenshot_verify_before_done]], flagging this distinction explicitly rather
than calling the visual/interactive experience "confirmed."
