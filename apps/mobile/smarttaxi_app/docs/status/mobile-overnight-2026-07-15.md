# Mobile overnight build-out — 2026-07-15

Scope: `apps/mobile/smarttaxi_app/**` only. Branch `dev`. Verified via `flutter analyze`,
`flutter build apk --debug`, and live install on the connected device
(`2409BRN2CY`, Android 16) unless noted otherwise.

## Done, verified live on device

### [0] Единый toast-компонент
- New `lib/core/widgets/app_toast.dart`: `AppToast.showError/showSuccess/showInfo`.
  Top-center card, icon+color by type, slide+fade in/out, auto-dismiss (error 4.2s,
  info 3s, success 2.6s), tap or swipe-up to dismiss early, stacks up to 3 concurrent
  toasts with a queue behind that.
- Wired in everywhere `ScaffoldMessenger.showSnackBar` was previously used for
  error/success feedback: `passenger_shell.dart` (region-not-loaded error, call
  failure, phone/ID copy success — 4 call sites) and `driver_shell.dart` (phone
  copy success — 1 call site).
- **Not yet done:** a real sweep of every inline `_InlineMessage`/error banner
  across the app to route through this instead — those already existed as
  in-form inline messages (not SnackBar) before tonight and were left alone;
  revisit if the intent was "replace inline errors too", not just SnackBar.
- **Not done:** `exit_on_double_back.dart`'s SnackBar (double-tap-to-exit hint) —
  deliberately left alone, it has its own dismiss-on-second-back-press timing
  that doesn't map cleanly onto the toast's fixed auto-dismiss model.

### [1] Фон auth-bg.png на экранах входа/регистрации/SMS
- Copied `auth-bg.png` → `assets/auth/auth_background_2026.png`, registered in
  `pubspec.yaml`.
- `_AuthBackdrop` in `main.dart` rewritten: was a small top "hero strip" with a
  hand-drawn wordmark fighting for contrast against a generic wave photo (today's
  whole earlier back-and-forth); now a single `Positioned.fill` +
  `Image.asset(..., fit: BoxFit.cover, alignment: topCenter)` of the new
  pre-designed full-screen asset (wordmark + tagline already baked in, no manual
  text/shadow/contrast tuning needed). Used by all 4 auth steps (welcome/register,
  password, SMS, new-password) since they all already share `_AuthBackdrop`.
- Confirmed via screenshot on-device: crisp, fully readable, no stretching.
- **Follow-up worth doing, not done tonight:** the source PNG is ~3.7MB
  uncompressed — fine functionally, but should be re-exported/compressed before
  a real release build to keep APK size down.

### [2] Единые маркеры карты (client side)
- Copied 3 assets → `assets/map/marker_my_location_2026.png` (pulsing dot),
  `marker_destination_2026.png` (checkered flag, "точка Б"),
  `marker_address_pick_2026.png` ("S" badge pin, address-selection). Registered
  in `pubspec.yaml`.
- `passenger_shell.dart`: `_userLocationMarkerAsset`/`_destinationMarkerAsset`
  repointed to the new files; new `_addressPickMarkerAsset` constant added.
- **Real bug fixed, not just a re-skin:** `_CenterMapMarker` (the marker that
  follows the map center while picking pickup/dropoff) used to render two
  *visually different* markers depending on `target` (pickup got the
  location-dot asset + radar pulse at one calibration, dropoff got the
  destination-pin asset at a different calibration/color). Spec explicitly
  asked for one identical marker for both, distinguished only by the field
  label — unified into a single build path using the new S-badge asset.
  Tip-anchor point was re-measured by alpha-channel column scan on the actual
  PNG (tip sits at 79.7% down the 1000×1120 canvas, *not* including the
  separate ground-shadow dot further below it — that shadow dot would have
  thrown off the anchor point by ~14% of the image height if included).
- Removed now-dead `_pickupMarkerColor`/`_dropoffMarkerColor` constants that
  existed only to color the old two-marker system.
- Compiles clean, `flutter analyze` 0 new issues. **Not verified live on
  device** — reaching the map/order screen requires a logged-in session
  against the real backend, which this session didn't have reachable
  credentials for; only static/compile verification done here.
- **Deliberately left alone:** `driver_shell.dart`'s own navigator UI
  (`_NavigatorPointMarker`, `_NavigatorCurrentMarker`) — these are compact
  circular icon badges for the in-navigation cockpit view, not photo-style
  pins, and restyling them to the new PNG assets would likely look wrong in
  that dense, functional context. The driver's *own car* marker shown on the
  passenger's map (`_driverCarMarkerAsset` / `driver_car_topview_white.png`)
  was left untouched — no replacement asset was provided for it and the spec's
  "same visual style" note reads as "don't let it clash", which it doesn't.

## Not started tonight (scope too large for this session)

Sections 3–16 of the brief are each a real feature (new backend contracts,
new screens, or both) — torg/price-offer, recurring bookings, driver navigator
camera/speed-limit voice alerts, "забыл вещь" support flow, SOS escalation to
support, share-trip polish, favorite addresses, favorite/blocked drivers,
in-ride quick messages, referrals, RU/KZ locale switch, client/driver profile
screens, settings screen, demand-zone hint, and the final full-app polish
pass. None of these were started — flagging honestly rather than claiming
partial/mocked coverage that isn't there yet. Recommend picking these up in
the same priority order next session, starting with §3 (price offer) since
it's explicitly numbered next and has a defined API contract to build against
or mock.

## Verification method note

No real backend/OTP credentials were available in this session to log in on
the live device, so anything past the auth screen (map, markers in situ,
order flow) could only be checked by `flutter analyze` + a clean debug build,
not a live screenshot. Said so explicitly per file above rather than
implying more was confirmed than actually was.
