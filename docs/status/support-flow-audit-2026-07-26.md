# Support-ticket flow audit — 2026-07-26 (apps/api/support, mobile Поддержка/SOS)

Fifth in this session's series of targeted "does the UI promise match what
the backend actually does" audits (client wallet — clean; driver wallet/
payout — 2 bugs fixed; referrals — 1 major bug fixed; recurring bookings —
1 bug fixed, 1 larger issue flagged; support — below). One commit on
`dev`, pushed.

## Fixed: admin replies never notified the client

`PATCH /:id/respond` updated `admin_response`/`status` and wrote an audit
log, but never called `notifyUser` — compare to the SOS/LOST_ITEM paths in
the same file, which do. No notification type for a support response
existed anywhere (`notification.service.js` had nothing for it), and the
passenger's own support screen only reloads its history on init,
pull-to-refresh, or right after submitting — no polling (unlike the
quick-message chat sheet's own 6s timer). The app's own copy explicitly
promises *"Мы ответим здесь и, если нужно, позвоним"* ("we'll answer here,
and call if needed") — a promise nothing was actually keeping unless the
user happened to reopen the tab and manually pull down.

Fixed by adding a `notifyUser` call to the respond handler, mirroring the
existing SOS/LOST_ITEM pattern (best-effort, non-blocking — a push
failure must never fail the admin's response). Wired the new
`SUPPORT_REPLY` type into: the shared `notificationCategoryForType` map
(so it correctly buckets under "Поддержка" in the passenger notifications
screen, not the generic "service" catch-all), the passenger notification
icon mapping, and the driver notifications screen's own separate icon
mapping (both roles can submit tickets, so both can receive this).

## Fixed: passenger's own ticket history showed raw "LOST_ITEM"

Every other support topic already stores its own Russian label as free
text (`topicRuLabel()` converts it client-side before sending) — LOST_ITEM
is the one deliberate exception, kept as a literal backend-matching
constant since `support.routes.js` keys off that exact string to notify
the trip's driver a passenger left something behind. The passenger's
`_SupportHistoryCard` rendered `item.topic` verbatim with no translation
back, so a lost-item ticket showed "LOST_ITEM" instead of a real label in
the one place a user actually reads their own ticket list. Mapped it back
to the existing `passengerSupportTopicLostItem` label at that render site.

## Re-verified, still correct: SOS priority/urgent-flagging

Both the passenger `_SafetySheet` and driver `_DriverSosSheet` SOS flows
submit `topic: 'SOS'`, matching `SOS_TOPIC` in `support.routes.js` exactly
(case-sensitive). `isUrgent`, the admin-queue SOS-first ordering, and the
operator-alert push all still function correctly per
`sos-priority-check.js` — checked directly against the current mobile
code rather than assuming the earlier fix still held, since this session
has repeatedly found stale assumptions elsewhere. No regression.

## Flagged, not fixed: driver support screen has no ticket-history UI at all

`driver_shell.dart`'s `_driverSupportContent` is submit-only — a topic
chooser, a message field, a send button. There is no call anywhere under
the driver feature tree to `GET /api/support/mine`. Yet
`driverSupportMessageSent` promises *"Администратор ответит в ближайшее
время"* ("the admin will respond soon") — a promise that's not just
stale-until-refresh (like the passenger bug above), it's **structurally
unviewable**: there's no history screen to even reopen. This is a real UI
gap, not a quick patch (it needs a whole new list screen, following the
passenger side's `_SupportHistoryCard` pattern) — flagged as a follow-up
task rather than built into this round.

## Verification

- `npm test` (apps/api): 29/29 pass (added
  `support-reply-notification-check.js`).
- `flutter analyze`: no issues. `flutter test`: 35/35 passed.
