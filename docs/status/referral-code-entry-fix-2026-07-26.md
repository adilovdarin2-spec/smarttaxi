# Referral program audit + fix — 2026-07-26 (apps/mobile registration, apps/api/referrals)

Follow-up to `driver-wallet-fixes-2026-07-26.md`. Third in this session's
series of targeted correctness audits on money-handling features (client
wallet — clean; driver wallet/payout — 2 real bugs fixed; referrals — 1
significant real bug found and fixed below). One commit on `dev`, pushed.

## The bug: the referral bonus loop was completely dead for every new user

The backend has fully supported referral-code redemption since it was
built:
- `auth.routes.js`'s `RegisterPasswordSchema` accepts an optional
  `referralCode`, and `POST /register/password` calls
  `applyReferralCode(client.id, body.referralCode)` right after creating
  the client row.
- `referrals.service.js`'s `applyReferralCode` looks up the code, sets
  `referred_by_client_id` (silently no-ops on an invalid code or
  self-referral rather than erroring registration).
- `awardReferralBonusOnFirstCompletedOrder` (called from the
  `TRIP_COMPLETED` transition) correctly credits the bonus to **both**
  the referred client and the referrer once the referred client's first
  order completes — matching exactly what the app's own share message
  promises ("получи бонус на первую поездку").

But the mobile registration flow (`main.dart`'s `_PhotoAuthScreenState`)
never had a field to enter a friend's code, and
`api_client.dart`'s `registerWithPassword()` never sent one to the
backend — confirmed by searching the whole `lib/` tree, the only
`referralCode`/`referral_code` matches outside models/API client were
two l10n strings. This directly contradicted the referrals screen's own
copy (`app_ru.arb`: `passengerReferralsHowItWorksText` — "Друг вводит
ваш код при регистрации", "a friend enters your code at registration").
Net effect: no user who registered through the mobile app could ever
have `referred_by_client_id` set, so `invitedCount`/`totalBonusEarned`
could never move for anyone — not because of the already-known,
deliberately-deferred self-referral/device-fingerprinting gap
(`admin-launch-readiness-2026-07-19.md`), but because the redemption UI
simply didn't exist. A real, verified gap, not a business-decision item.

## Fix

- `api_client.dart`: `registerWithPassword()` gained an optional
  `referralCode` parameter, included in the request body only when
  non-empty.
- `main.dart`: added `_referralCodeController`, disposed alongside the
  other controllers; wired into `_register()`; cleared alongside the
  password controllers on every reset path back out of the registration
  step (back-to-SMS button, forgot-password flow) for consistency, though
  left un-cleared on the SMS-verified → register-mode transition itself,
  matching the existing pattern there (the name field isn't cleared on
  that transition either).
- Added an optional `_PhotoAuthTextField` to the registration form, right
  after the name field, labeled "Код приглашения (необязательно)" /
  "Шақыру коды (міндетті емес)" (new `referralCodeFieldLabel` l10n key,
  both languages), reusing `Icons.card_giftcard_rounded` — the same icon
  already used for the referrals drawer entry, for visual continuity.
  `TextCapitalization.characters` since the backend normalizes codes to
  uppercase anyway (`applyReferralCode`'s `code.toUpperCase()`) — purely
  a UX nicety, not required for correctness.
- Regenerated `app_localizations*.dart` via `flutter gen-l10n` (project
  has `generate: true` in `pubspec.yaml`, and — unusually for a default
  Flutter setup — the generated files live directly in `lib/l10n/` and
  are committed, not under `.dart_tool/`, matching this repo's existing
  convention). Diffs came out minimal and additive (6/3/3 lines across
  the three generated files) — verified before staging.

## Verification

- `flutter analyze`: no issues.
- `flutter test`: 35/35 passed.
- **Live on-device verification not done.** Unlike the driver-wallet
  ADJUSTMENT-row fix (which needed contrived backend data), this fix is
  fully exercisable through the completely standard registration flow —
  no special setup needed. Attempted to sideload a debug APK onto the
  available test device to verify visually; `adb install -r` failed with
  `INSTALL_FAILED_USER_RESTRICTED`. Unlike the earlier attempt's other
  failure modes (unresolved intent, missing Files activity — plausibly
  workaroundable via a different install path), this specific error means
  a device-level policy (`DISALLOW_INSTALL_APPS` or equivalent) is
  blocking all package installation outright, not gating it behind a
  UI-confirmation step. That's a real security restriction, not an
  incidental obstacle, so no further workaround was attempted. Verified
  correctness via direct code tracing against the exact backend contract
  instead (cited above) plus static analysis/tests.

## Not changed (correctly, per the audit)

- Field mapping for `ReferralSummary` (`code`/`invitedCount`/
  `totalBonusEarned`) matches the backend's `referralSummary` exactly,
  with safe parsing/fallbacks — no null-safety risk.
- No false "earned" display: `totalBonusEarned` is sourced from actually-
  credited `REFERRAL_BONUS` transactions only, never an uncredited
  promise — unlike the driver-wallet class of bug, there was no
  misleading-state issue on the summary screen itself.
- State sync (drawer nav, tab-select, pull-to-refresh) all correctly
  reload the referrals screen; no staleness found.
- Generic retry-on-error is appropriate for the summary screen — no
  domain-specific rejection reasons exist for `GET /referrals/mine` to
  swallow, unlike the driver payout flow.
