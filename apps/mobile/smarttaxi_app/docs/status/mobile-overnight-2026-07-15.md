touched, staged, or committed here; every commit this pass named
exact files (`passenger_shell.dart` only), confirmed via `git status`
immediately before each `git add`.

## Follow-up: marker/promo/tariff bug-fix round — `5b6f48d`

Direct bug report after the previous "final polish" pass: address-picker
marker still reads as small, promo-code input hides typed text past
5-6 characters, recurring bookings and favorite addresses "don't
work", Atakent-region address coverage is sparse, back button still
exits the app with no visible warning, and tariff cards "look
terrible" (long but badly proportioned).

- **Address-picker marker, round 3**: measured the actual asset
  (`assets/map/marker_address_pick_2026.png`) pixel-by-pixel with
  Python/Pillow (`Image.open(...).convert('RGBA').getbbox()`) instead
  of guessing again — canvas is 1000×1120 but the real non-transparent
  content bbox is only (115,31,885,1051) = 770×1020, i.e. 77%/91% of
  the declared size. The previous round's `pinWidth: 36` was rendering
  real content at ~28px, which reads as small. Enlarged
  `_CenterMapMarker` again: `pinWidth` 36→**50**, outer footprint
  90→**126**, pulse ring `baseSize` 25→**35**, ground-shadow
  22×7 (from 16×5), translate offsets scaled proportionally. Pickup/
  drop-off pin markers (`_assetMarker`) were intentionally left as-is
  (already shrunk in earlier rounds per explicit request — this
  complaint was specifically about the picker crosshair, not the
  route pins).
- **Promo-code input**: root cause found — the `TextField` shared a
  `Row` against a fixed `width: 140` `ElevatedButton`, leaving ~120dp
  for text next to a prefix icon, so anything past 5-6 characters
  scrolled the field's start out of view. Rebuilt as a vertical stack
  (full-width `TextField` with `textCapitalization.characters`, then a
  full-width `_GoldCtaButton` below it) — text now has the whole card
  width and is never clipped.
- **Tariff cards**: found a real layout inconsistency — the icon
  `Container` was centered while the title/price text below it was
  left-aligned, which reads as visibly unbalanced on "stretch" cards
  (the common case: 2 tariffs always trigger stretch mode). Rewrote
  `_TariffCard.build()` to branch on `stretch`: a horizontal `Row`
  (icon left, title+price+badge in an `Expanded` column, all
  left-aligned together) for stretch mode, keeping the original
  vertical/centered layout unchanged for narrow mode. Icon box and
  card padding are now stretch-aware too (52×52 fixed vs full-width).
- **Recurring bookings / favorite addresses "don't work"**:
  investigated against production, not just the repo. `curl` against
  `https://smarttaxi-api-production.up.railway.app` shows
  `/api/recurring-bookings/mine`, `/api/favorites/addresses`,
  `/api/favorites/drivers`, `/api/referrals/me`, and
  `/api/orders/:id/quick-message` all return 404
  (`{"error":"ROUTE_NOT_FOUND"}` — Express's catch-all, meaning the
  route genuinely isn't registered on the running server), while
  `/api/health`, `/api/notifications`, `/api/orders/me/active`,
  `/api/orders/me/history`, and `/api/tariffs` all respond correctly.
  The routes exist correctly in the repo (`apps/api/**`, items 4/9/10/
  12 from earlier in this document) — this is a **production
  deployment gap**, not a mobile bug. Nothing to fix on the mobile
  side; flagged to the user directly, out of `apps/mobile/**` scope.
- **Atakent-region address coverage**: traced the real geocoding
  chain (`apps/api/src/modules/routing/routing.service.js`):
  MapTiler → Photon → Nominatim (OpenStreetMap), with a local
  curated-hints fallback. Sparse results for a small settlement like
  Atakent are consistent with genuine third-party OSM data coverage
  limits, not an app-side bug — could not 100% rule out a MapTiler-
  side failure without deeper backend log access, but no evidence of
  a client-side defect either. No mobile code change made.
- **Back button exiting instead of warning**: read
  `lib/core/widgets/exit_on_double_back.dart` (a shared helper used by
  both `passenger_shell.dart` and `driver_shell.dart`'s root-level
  `PopScope` handling). It showed its "press again to exit" warning
  via `ScaffoldMessenger`/`SnackBar`, which renders *behind* the
  opaque, Stack-positioned bottom order panel that both shells keep
  pinned to the bottom of the Home tab — the warning fires but is
  never visible, so the first back press looks like nothing happened
  and the second press exits with no warning ever seen. Fixed to use
  the existing root-`Overlay` `AppToast` helper instead of
  `ScaffoldMessenger`. **This file is untracked** (belongs to a
  parallel session's in-progress work per this session's standing
  parallel-sessions awareness) — the fix is real and verified via
  `flutter analyze` on all 3 usage sites, but deliberately **left
  uncommitted**, since committing someone else's untracked file isn't
  this session's call to make. Flagged directly to the user.

**Verified:** `flutter analyze` clean (same pre-existing warnings,
none new) on `passenger_shell.dart` and `exit_on_double_back.dart`.
`flutter test`: 14 passed / 10 failed, unchanged baseline. **Could not
verify live**: the device (`2409BRN2CY`) is currently blocking APK
installs (`INSTALL_FAILED_USER_RESTRICTED`, confirmed non-transient —
two retries failed and the app was fully uninstalled per
`adb shell pm list packages`), needs a manual on-device approval
before the next install can proceed. Per this session's established
preference for stopping over forcing risky infra workarounds when live
testing is blocked, no attempt was made to bypass this — all of this
round's changes (marker, promo field, tariff cards) are code-verified
only, and are called out to the user as pending live re-verification.
