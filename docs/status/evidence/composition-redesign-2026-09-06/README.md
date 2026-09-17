# Composition redesign evidence — 2026-09-06

This directory contains actual local-product captures from the composition and
map-presentation pass. It is evidence of the named states only, not a statement
that every production, regional, payment or navigation scenario is accepted.

## Current Android candidate

`android-final/` contains ten captures from the installed localhost debug APK on
the physical Xiaomi 2409BRN2CY (Android 16, 360dp wide): the smaller startup,
passenger home, empty and populated address search, map picker, Economy/Delivery
tariffs, payment selection, wallet and recurring-payment empty state. No order or
real payment was placed from the phone in this capture set.

## Android iteration evidence

`android-iteration/` contains useful earlier captures of authentication, profile,
settings, promo and driver surfaces. They are intentionally labelled iteration:
some precede the final shared type-scale adjustment. The wallet/recurring images
from a DRIVER account in passenger mode are diagnostic evidence of the remaining
API-role mismatch, not approved empty-state goldens.

## Current web candidate

- `web-order/`: nine passenger order, picker, tariff, payment and explicit
  unresolved-address states at the two compact widths.
- `web-accounts/`: 15 account/application sections at 390×844 and 360×740, plus
  the assertion result.
- `web-trip/`: 49 captures from the paired passenger/driver lifecycle, including
  GPS loss/retry, failed-action preservation, reload recovery, completion and
  local CASH settlement, plus the assertion result.

The browser runs used only `http://127.0.0.1:5175` and the development API at
`http://127.0.0.1:4001`. Browser GPS is a declared test fixture. Result files were
checked for authentication headers, tokens, passwords and secrets before being
tracked.

The implementation, qualifications and remaining acceptance work are recorded
in [the composition report](../../composition-redesign-2026-09-06.md).
