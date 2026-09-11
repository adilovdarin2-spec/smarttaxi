# Driver wallet/payout correctness fixes — 2026-07-26 (apps/mobile driver wallet)

Follow-up to `admin-panel-role-audit-2026-07-25.md`. Same methodology
(dispatch a targeted audit of a feature that hadn't had a dedicated
correctness pass, fix what's real) applied to the driver-side wallet, as
the natural counterpart to auditing the client-side wallet the round
before. One commit on `dev`, pushed.

## Fix 1: ADJUSTMENT transactions rendered with the wrong sign and color

`wallet.service.js`'s `walletTransactionAmount` passes the raw *signed*
`driver_debt_delta` through as `amountKzt` for kind `ADJUSTMENT` — negative
when debt is auto-settled from balance (`settleDriverDebtFromBalance`,
always `-settleAmount`), positive when an admin manually increases a
driver's debt (`adjustDriverDebt`). The wallet screen's
`_WalletTransactionRow` only special-cased `CASH_TRIP_COMMISSION` as a
debit (`isDebtCharge`); every `ADJUSTMENT` row fell through to the
"credit" branch — green, up-arrow, and a hardcoded `+` prepended onto
`_money()`'s own output (which already prepends `-` for negative values).
Two real symptoms: a negative delta rendered as the garbled **"+-500 ₸"**,
and a positive delta (driver now owes *more*) rendered green with an
up-arrow, indistinguishable from real income.

Fixed by giving `ADJUSTMENT` its own neutral styling (gold — the same
"pending/neutral, not success or danger" accent already used consistently
elsewhere in this file family, e.g. the paid-vs-pending order badge in
`driver_order_widgets.dart`) and letting the amount display its own
already-correct sign from `_money()` directly, with no extra prefix.

## Fix 2: payout-request submission always showed one generic error

`DriverPayoutRequestSheet._submit()`'s catch block always set the same
generic error message regardless of *why* the backend rejected the
request. The backend can reject for four distinct, already-user-facing
reasons — `PAYOUT_EXCEEDS_BALANCE`, `PAYOUT_BELOW_MINIMUM`,
`PAYOUT_DETAILS_MISSING` (`wallet.service.js`/`wallet.routes.js`), and
`DRIVER_BLOCKED` — and the exact same l10n strings for three of these are
already used one screen up for the client-side pre-checks (which can go
stale between opening the sheet and submitting — e.g. debt auto-settles
from balance in the background, changing available balance). Wired
`apiErrorCode(error)` the same way the sibling `EditPayoutMethodSheet._save()`
flow (`driver_payout_widgets.dart`) already does, so the specific reason
surfaces instead of a generic failure.

## Not changed (correctly, per the audit)

- Field-name mapping for `WalletSummary`/`WalletTransaction`/`PayoutRequest`
  matches the backend exactly.
- Card-list/payout-details state stays synced (reload-on-pop pattern,
  already correct).
- Payout amount already capped at raw `balanceKzt` without netting debt for
  display — this is a previously-documented, deliberate decision
  (`mobile-driver-overnight-2026-07-15.md`, round 42), not re-flagged.
- No client-side Luhn check on the payout card number (only a length
  check) — low severity since the resulting `INVALID_CARD_NUMBER` error is
  already mapped to a specific "looks like a typo" message; the cost is an
  avoidable round-trip, not user confusion. Left alone.

## Verification

- `flutter analyze`: no issues.
- `flutter test`: 35/35 passed.
- **Live on-device verification not done for the ADJUSTMENT-row fix
  specifically.** Reproducing the exact scenario needs a real debt
  adjustment against a live driver account — a separate, more invasive
  live action than this display fix warrants on its own. Attempted to
  sideload a debug APK onto the available test device
  (`IBOVEMHQBQBQMJTS`, confirmed idle via `dumpsys power` — last user
  activity ~94 hours ago) to at least smoke-test for crashes/regressions;
  blocked at every path tried this round: `adb install -r` refused
  (`INSTALL_FAILED_USER_RESTRICTED`), a `file://` VIEW intent for the
  pushed APK found no resolving activity, and launching the Files app
  directly failed (`FilesActivity` doesn't exist under that name on this
  device/DocumentsUI version). Did not escalate further (e.g. blind
  `input tap` navigation through an unknown file-manager UI) since the
  underlying bug is a deterministic string-formatting/logic issue already
  confirmed by direct code tracing, not a subjective visual question
  static analysis can't answer (contrast a `dark:false`-hardcoded-in-a-
  dark-theme bug from earlier sessions, which genuinely needed a
  screenshot). The color/icon choice (gold) reuses a pattern already
  proven correct elsewhere in the same file family, so visual risk is low.
