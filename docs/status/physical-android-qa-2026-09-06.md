# Physical Android QA — 2026-09-06

This is local development evidence, not commercial release acceptance or a
road test. Work stays on `dev`. No emulator, production login, external SMS,
merchant transaction, mock GPS, uninstall, data clearing or security bypass
was used.

## Device and build boundary

- Xiaomi 2409BRN2CY, Android 16, physical screen 720×1640 (360dp wide).
- The owner's normal restart allowed one `adb install -r` to succeed. The
  installed `base.apk` was pulled and its SHA-256 matched the localhost APK:
  `157107efdb64d30f2b8401ddeaea91e685fa105664feeeca775ca95d97e9173a`.
- The main screen matrix below is from that installed baseline. The separate
  candidate inspection below identifies screenshots after the source fixes.
- API/socket are `http://127.0.0.1:4001`; web is
  `http://127.0.0.1:5175`. ADB reverse provides the connection. Readiness
  reported `development`, database/Redis/OSRM OK; the container's SMS provider
  was verified as `dev` before login/registration.
- A subsequent passenger-fix APK was refused with
  `INSTALL_FAILED_USER_RESTRICTED: Install canceled by user`. That message
  does not establish that the owner actually pressed Cancel; see the earlier
  [installer diagnostic](phone-install-diagnostics-2026-09-05.md).
- USB reverse ports later disappeared. Readiness on the host remained good;
  restoring those two mappings restored the phone's API access and allowed
  the driver to go offline. Do not diagnose that local tether loss as an API
  or driver-status logic failure.

## Screens actually exercised

Evidence is under [android-2026-09-06](evidence/android-2026-09-06/).

| Native screen/action | Observed result | Screenshot |
|---|---|---|
| Local login, initial GPS/region | Password login using seeded local accounts; real GPS suggested Myrzakent | [Region](evidence/android-2026-09-06/start.png) |
| Passenger home | Real pickup resolved to улица Бектасова, 60, Мырзакент | [Home](evidence/android-2026-09-06/home.png) |
| Address search | Search accepted input and returned selectable catalogue/provider results; Technodom was selected | [Search](evidence/android-2026-09-06/search.png) |
| Route and Economy | Server route 1.3 km / 3 min, 700 ₸; route geometry was hidden behind the panel | [Economy](evidence/android-2026-09-06/route-economy.png) |
| Delivery | Second tariff available, 800 ₸ | [Delivery](evidence/android-2026-09-06/route-delivery.png) |
| Payment choice | CASH available, bonus balance 0; no merchant/card success was simulated | [Payment](evidence/android-2026-09-06/payment.png) |
| Map selection | Reverse lookup resolved Technodom, улица Мадиходжаева, 13; obsolete flag/route overlapped the active picker | [Picker](evidence/android-2026-09-06/picker.png) |
| Driver offline/online | Myrzakent selected, native online action succeeded with device GPS | [Offline](evidence/android-2026-09-06/driver-home.png), [online](evidence/android-2026-09-06/driver-online.png) |
| Incoming order | Appeared after pull-to-refresh, not automatically; native Accept succeeded | [Order](evidence/android-2026-09-06/driver-order-card.png), [accepted](evidence/android-2026-09-06/driver-accepted.png) |
| Going to pickup / navigator | Native action changed status; navigator showed the real pickup leg | [Pickup navigation](evidence/android-2026-09-06/driver-navigator-pickup.png) |
| Arrived / waiting | Both native transitions succeeded; free waiting countdown appeared | [Arrived](evidence/android-2026-09-06/driver-arrived.png), [waiting](evidence/android-2026-09-06/driver-waiting.png) |
| Trip / navigator | Native start changed the target to Technodom and loaded its route/maneuver | [Trip](evidence/android-2026-09-06/driver-trip.png), [navigation](evidence/android-2026-09-06/driver-navigator-trip.png) |
| Completion / cash receipt | 700 ₸ gross, 105 ₸ commission, 595 ₸ driver total; native manual CASH receipt action succeeded | [Before receipt](evidence/android-2026-09-06/driver-completed-unpaid.png), [after receipt](evidence/android-2026-09-06/driver-completed-paid.png) |

The phone used the seeded local passenger/driver accounts via the ordinary
login UI. The lifecycle counterpart was one newly registered local QA client
created through the dev-SMS/public-auth flow, not an injected token. Its only
order was `66ac4511-4be8-4c14-9b74-e8dd7aa8d814`, explicitly labelled as
stationary UI QA, with CASH and no real ride or funds. Driver lifecycle actions
were performed on the phone, not manufactured by SQL or privileged endpoints.
The public client active-order response is now null; read-only database checks
confirm that exact order is `PAID`/`PAID` and the seeded driver is `OFFLINE`.
The rating was skipped, and the completion card was dismissed normally.

The first pass did not exercise native passenger trip screens. The later
candidate follow-up below adds searching and assigned-driver evidence only;
API counterpart checks and browser coverage are not native screenshots.

## Confirmed defects and scoped candidate fixes

1. **Passenger route hidden by the tariff panel.** The native camera only
   centered a coordinate and did not fit the route into the visible map.
   `MeasureSize` now reports the actual collapsible panel height; the native
   viewport uses it to fit every route point and both endpoints with safe
   insets. A signature avoids repeated framing during ordinary rebuilds or
   user panning, and panel-animation measurements are debounced.
2. **Oversized finish flag and obsolete picker overlays.** The passenger native
   flag scale was reduced for its 1000px source canvas. During point editing,
   the old route and the endpoint being edited are hidden, while the other
   endpoint remains. Approved square-tail artwork and domain address state
   were not changed.
3. **Clipped home-panel footer.** The candidate allows more height for the
   initial panel. This needs phone reinspection together with the remaining
   single-point camera occlusion below; a build/test pass is not visual proof.
4. **Missing automatic incoming order after account switch.** The server's
   actual dispatch query returned the order for this approved FREE driver in
   Myrzakent. Native pull-to-refresh displayed it. A no-network test of the
   installed `socket_io_client` library reproduced the same socket being
   returned after passenger dispose + driver connection on the same origin.
   Its empty URL path and cached `/` namespace preserve old authentication.
   Explicit session connections now use `enableForceNew`; automatic reconnect
   still uses that session's socket. The regression fails without this option
   and passes with it. Native after-fix automatic dispatch remains to verify.

No API/web production source, state machine, address importer, artwork, or
native driver route renderer was changed in this pass.

## Verification and remaining acceptance

- Flutter full suite: **95 passed**; analyzer: **no issues found**.
- Local debug APK built with all three explicit localhost defines above.
  Final candidate SHA-256:
  `4a2432eea3f48bed971703607000ae4d5c229fe8649cdae3c7b24aa37617feeb`.
- `git diff --check` and `docker compose config -q` pass.
- API: dependency policy and all 36 checks pass; web production build passes.
  Existing toolchain and MapLibre chunk warnings remain unsuppressed.
- The final candidate's normal replacement installation **succeeded** after
  the USB connection was restored. Its installed `base.apk` was pulled and
  independently hashed: it matches `4a2432...17feeb` above.

### Candidate inspection

- [Home after](evidence/android-2026-09-06/candidate-home.png): footer is fully
  visible, but the original pickup pin is still occluded by the panel.
- [Route after](evidence/android-2026-09-06/candidate-route.png): the complete
  blue route and both endpoint markers are visible above the expanded tariff
  panel, street/city labels remain readable, and the flag is compact.
- [Picker after](evidence/android-2026-09-06/candidate-picker.png): the old
  route/flag no longer cover the approved center marker. The old route summary
  pill is still shown while choosing a new point; this needs to be hidden.
- Ordinary native logout/login and real region confirmation work on this APK.

Still open: finish visual acceptance; home pickup/camera
occlusion (the baseline pin sits behind the panel); native driver Line-map
car sizing; remaining native passenger trip states and cross-client visual
parity; full road GPS, background/resume and voice navigation. The stationary
navigator displayed fluctuating nonzero speed readings (roughly 17–24 km/h),
so its speed behavior is **not accepted** without raw device telemetry and a
controlled physical test. Do not replace the value with an invented speed.
The driver renderer is deliberately unchanged pending its dedicated visual
before/after pass. Legal, official RKA, merchant/SMS and provider/store inputs
remain external; see the [release list](RELEASE-REMAINING-2026-09-05.md).

## Follow-up after `ec9523f`

On the installed `4a2432...17feeb` APK, the seeded passenger created a second
isolated local order from the actual native UI:
`d7a72dcf-703b-49ff-9bb9-d4b5f35ef6cd`. A normal password-authenticated seeded
driver acted as the API counterpart, with the existing real-device location;
no location was fabricated. The native passenger screen changed automatically
from searching to driver found after acceptance, without manual refresh.

- [Native searching](evidence/android-2026-09-06/passenger-searching.png).
- [Native assigned](evidence/android-2026-09-06/passenger-assigned.png).
- [Driver/car details](evidence/android-2026-09-06/passenger-driver-details.png):
  the seeded driver's name, Toyota Camry, plate, CASH and 700 ₸ are displayed;
  the detail card scrolls to its contact/cancel controls. No call was made.

The device then disappeared from `adb devices -l` (empty list), preventing
further screenshots and installation. Going-to-pickup, arrived and waiting
were accepted by the counterpart API, **but their native passenger screens
were not observed**. To avoid leaving an outstanding test, the exact bound
order was cancelled through a fresh ordinary login to the same seeded client
and its public cancellation endpoint. The active-order read returned null;
the counterpart driver was set offline. That cleanup login supersedes the
phone's seeded passenger session, so expect normal reauthentication on resume.
No other order was cancelled, no data was deleted and no merchant was used.

### Next candidate, not installed or visually accepted

- Home camera now uses the measured unobscured map area to scroll the pickup
  above the sheet while retaining the native zoom and 55-degree pitch. Only a
  changed pickup, deliberate new GPS selection or changed panel/viewport
  reframes it; ordinary rebuilds retain a user pan. Programmatic camera-idle
  events do not overwrite the chosen location between the two camera moves.
- The outdated route summary is hidden while choosing a new map point.
- Files: `passenger_shell.dart`, `passenger_map_viewport.dart`, and
  `passenger_map_viewport_test.dart`. Driver renderer/artwork remain unchanged.
- Analyzer: no issues; full Flutter suite **96 passed**; explicit localhost
  debug APK built. SHA-256:
  `5c207440a8dea8c25afd339f1db29a7747f883f64a3d406268bf0278c85bbd4f`.
  This hash is a **candidate**, not the hash currently verified on the phone.
- Next: reconnect the phone, restore both reverse ports, install this candidate
  normally, log in to local dev, inspect home/collapse/recenter/picker and
  repeat native passenger waiting/active/completion plus automatic native
  driver dispatch after an account switch. Preserve all external boundaries.
