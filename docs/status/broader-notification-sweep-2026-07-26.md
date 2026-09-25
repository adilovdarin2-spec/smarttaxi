# Broader "promised but unwired" sweep — 2026-07-26

Sixth in this session's series of targeted audits. Instead of continuing
to pick individual features one at a time, ran one broader sweep across
`app_ru.arb` for phrases describing a concrete automatic action or
guarantee ("мы отправим"/"начислим"/"уведомим"/"свяжемся"/"автоматически"
etc.), covering areas not yet checked this session (favorites, driver
rating, trip history, notifications screen itself, profile/settings,
driver-application onboarding). One commit on `dev`, pushed.

## Fixed: driver region approval/block never notified the driver

`PATCH /drivers/:id/regions` (`setDriverRegionApproval` in
`admin.routes.js`) updated the approval row with no `notifyUser` call at
all — the adjacent document-review endpoint in the same file already
notifies on approve/reject, but this endpoint (which gates the exact same
"can I go online" funnel, one step further down it) silently never grew
the same call. A driver whose region got approved or blocked had no way
to find out except force-quitting/reopening the app or manually
pull-to-refreshing the "Заявка на рассмотрении" screen — even though the
app's own onboarding copy (`passengerDriverStep2Text`,
`driverApplicationUnderReviewMessage`) explicitly sets an expectation that
review status will be communicated.

Fixed by adding the notification, mirroring the existing
`DRIVER_DOCUMENT_STATUS` pattern exactly (best-effort, non-blocking).
Wired the new `DRIVER_REGION_STATUS` type into the driver notifications
screen's icon mapping.

**Caveat, disclosed rather than silently left implicit:** this fixes
whether the driver ever gets told at all. It does not make the region
badge on the "Линия" home screen live-update the moment the notification
arrives — see the next finding.

## Flagged, not fixed: no screen anywhere auto-refreshes on push receipt

While verifying the fix above would actually be *visible* to a driver
sitting on the home screen (not just delivered to the system tray),
found that `push_service.dart`'s `onMessageReceived` callback — wired to
both `FirebaseMessaging.onMessage` (foreground) and
`FirebaseMessaging.onMessageOpenedApp` (tapped) — is never assigned
anywhere in the app (grepped the whole `lib/` tree). It's a dead hook.
This means **no notification of any type** triggers a live screen
refresh — not just region approval, but order status, support replies,
wallet/payout status, recurring-booking accept/decline, all of it. The
notification still gets recorded and shown in the in-app notifications
list/system tray, so nothing is silently lost the way the region-approval
and support-reply bugs were — but any *other* screen currently open stays
stale until the user manually refreshes or navigates away and back.

This is a real, valuable fix, but an architecture decision (which
mechanism: event bus, targeted refresh-by-type, extending the existing
socket.io real-time pattern already used for order tracking, etc.), not a
one-line patch — flagged as a separate follow-up task rather than
expanded into this round's scope.

## Checked and clean (not reported as findings)

- **Favorite/blocked drivers-clients**: both directions of BLOCKED are
  actually enforced in dispatch (`order-dispatch.service.js`, both in the
  offer feed and at accept-time). Favorites carry no dispatch-priority
  promise in the copy, so there's nothing there to break.
- **Driver rating/quality flow**: reviews are real, `AVG(rating)` syncs to
  `drivers.rating`, and the auto-block-on-low-rating path fires a real
  `DRIVER_AUTO_BLOCKED` push — fully wired.
- **SMS auth promise**: Infobip is genuinely called in production;
  dev-mode fallback is an environment config, not a dead feature.
- Cashback notifications, trip history, and settings/push-permission
  copy are either already wired correctly or purely descriptive with no
  broken automatic-action promise behind them.

## Verification

- `npm test` (apps/api): 29/29 pass (extended `driver-approval-check.js`).
- `flutter analyze`: no issues.

## Session-wide tally (six rounds, this window)

Admin panel (6 fixes) → client wallet (audited, clean) → driver wallet/
payout (2 fixes) → referrals (1 major fix — dead feature for all new
signups) → recurring bookings (1 fix, 1 larger issue flagged, now
in progress in a separate session per the user's own follow-up) →
support/SOS (2 fixes, 1 larger issue flagged, now in progress in a
separate session) → this broader sweep (1 fix, 1 larger issue flagged).
13 real, verified, regression-tested fixes total; 3 larger, properly-
scoped follow-ups flagged rather than folded into inline patches, two of
which the user has already picked up as separate sessions.
