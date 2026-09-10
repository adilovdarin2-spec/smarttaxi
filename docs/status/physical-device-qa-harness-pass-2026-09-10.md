# Physical-device QA harness pass — 2026-09-10

## Result

The local Android companion flow now recognizes the exact order created by its
own `create-client-order` command. Previously that command registered a fresh
`+7708...` rider, while `inspect` and `step` accepted only the historical seeded
rider. As a result, a newly created phone-QA order could not be advanced through
the driver lifecycle.

## Safety boundary

- The helper remains limited to the local development environment and refuses
  non-loopback API URLs.
- Generated orders must use CASH and match the immutable QA name, note,
  addresses and coordinates exactly.
- A phone-number prefix or display name alone is not sufficient to authorize a
  status change.
- The historical seeded local CASH fixture remains supported for earlier QA
  runs.
- Age and active-order guards in the lifecycle command remain unchanged.

## Verification

- Physical-device QA policy check: 7/7 assertions passed.
- Existing physical-device command guard check: 5/5 assertions passed without
  login or order mutation.
- Complete API test chain passed, including 121,361 address rows across 13
  regions.
- A fresh generated fixture was then exercised end to end against the rebuilt
  Docker API on port 4001: `inspect` found it and the guarded helper advanced it
  through `DRIVER_FOUND`, approach, arrival, waiting, trip, completion and
  `PAID`; the driver was returned to `OFFLINE`.
- The unit and command-guard checks did not create or mutate a database order.
  Only the explicitly described end-to-end run changed local development data.

Installation and live lifecycle verification still require a device exposed to
ADB. This report does not claim that the current APK was installed.
