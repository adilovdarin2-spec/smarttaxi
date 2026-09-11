# SOS priority in support queue — 2026-07-15 (apps/api, branch `dev`)

Closes the `SECURITY_CHECKLIST.md` "SOS — not prioritized in the support
queue" gap (real gap, not a hypothetical risk — mobile's SOS button
already calls `POST /api/support` with `topic: 'SOS'`, landing in the
same unsorted, unflagged queue as a lost-item report).

Admin/web: sync against this list if/when the admin panel builds a support
queue UI.

---

## What changed

`apps/api/src/modules/support/support.routes.js` only — no schema change,
`topic` already carried the one signal that mattered.

- **`publicMessage()`** (used by every support endpoint) now includes
  `isUrgent: boolean` — `true` when `topic === "SOS"`. Don't re-derive this
  client-side by string-matching `topic` yourselves; the field is the
  contract.
- **`GET /api/admin/support`** now sorts SOS reports first, ahead of
  everything else, regardless of age (`ORDER BY (topic=$1) DESC,
  created_at DESC` for both the default/`ALL` and status-filtered cases).
  A day-old SOS report (if one were ever still open) would still sort
  above a message submitted a second ago.
- **`POST /api/support`** — submitting with `topic: 'SOS'` now also fires
  a distinct alert to every active `OWNER`/`OPERATOR` user (not `FINANCE`
  — this is operational, not financial), via the existing `notifyUser`
  (in-app `notifications` row always written; best-effort push if that
  user has a registered device token). Type `SOS_ALERT`, best-effort/
  non-blocking — a notification failure never fails the SOS submission
  itself, same pattern as the pre-existing `LOST_ITEM` push to the order's
  driver.

## Not done (explicitly out of this session's scope: `apps/api` only)

`apps/web`'s admin panel has no notifications-bell UI and no SOS
highlighting in its support queue view today — this pass only builds the
backend contract (`isUrgent`, the sorted list, the `SOS_ALERT`
notification) for a future admin/web session to surface. Not silently
skipped — flagging it here explicitly so it doesn't get assumed done.

## Verification

No live database access this session — syntax-clean and logic-reviewed,
not integration-tested. `npm run syntax` and `npm test` (20 checks now,
including the new `src/tools/sos-priority-check.js`) both pass.

## Commits (this pass)

1. `feat(support): prioritize SOS reports in the admin queue + alert operators`
2. `docs: this section + SECURITY_CHECKLIST.md update`
