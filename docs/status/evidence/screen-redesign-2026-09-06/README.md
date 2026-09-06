# Screen redesign evidence — 2026-09-06

64 real captures plus two browser result files. These are local QA screenshots,
not generated mockups. API/socket: `127.0.0.1:4001`; web: `127.0.0.1:5175`.
Only local development accounts/orders were used. No tokens, session files,
network dumps, APKs or signing material are included.

## Android

Physical Xiaomi 2409BRN2CY, Android 16, 720×1640 / 360dp. No emulator or
physical GPS mocking. Representative captures were visually inspected; coverage does not prove
real driving, every nested form, every error or native passenger in-trip parity.

Latest installed hash-verified APK:

- [Home](android/home-installed.png)
- [Two tariffs and route](android/tariffs-installed.png)
- [Payment selection](android/payment-installed.png)
- [Completed settlement](android/driver-complete-final.png)
- [After local cash receipt](android/driver-paid-final.png)

Earlier candidates from the same redesign, before the final secondary-copy,
payment and driver caption/completion refinements:

- `auth-after.png`, `search.png`, `delivery-final.png`.
- `profile-final.png`, `wallet-final.png`, `favorites-final.png`,
  `history-final.png`, `notifications-final.png`, `recurring-final.png`,
  `promo-final.png`, `drivers-final.png`, `support-final.png`, `faq-final.png`,
  `about-final.png`, `settings-final.png`.
- `driver-line-final.png`, `driver-incoming-final.png`,
  `driver-accepted-final.png`, `driver-going-final.png`,
  `driver-sticky-action-final.png`, `driver-arrived-final.png`,
  `driver-waiting-final.png`, `driver-trip-final.png`,
  `driver-navigator-final.png`.

Names ending `final` in this second group describe capture-time names, not
pixel-identical goldens for the latest APK. In particular the wallet image still
has the duplicate header action subsequently removed; trip image still has the
pickup caption subsequently replaced on the destination leg. The fixed driver
action was exercised through arrived/wait/start/complete on-device.

## Web

- `web-order/`: home, map picker at 360px, unresolved-address state, tariff
  preview at 360px and payment sheet, from the passing client smoke.
- `web-accounts/`: all 15 drawer/account sections at 360×740. The script also
  checked 390×844; these duplicate-width images were not added to Git.
  [Result](web-accounts/result.json) includes real settings navigation and bell.
- `web-trip/`: paired passenger/driver incoming, accepted, arrived, waiting,
  trip, completed and paid states, plus driver going. Passenger captures are
  360px. [Result](web-trip/result.json) records the full passing lifecycle and
  recovery checks. Browser GPS is an explicit fixture; the local API writes,
  order state and received updates are real.

See [scope, tests and remaining acceptance](../../screen-redesign-2026-09-06.md).
