# Native driver lifecycle — 2026-09-05

Confirmed against the cancellation API contract and driver state handling:
successful driver cancellation returns the order to `SEARCHING_DRIVER` with
no driver. The app previously retained that order and its route. A late route
response could also restore a cleared route after cancellation or completion.

## Changes

- Reconcile active order state consistently across REST actions, sockets,
  restore and local dismissal; release cancelled/reopened assignments.
- Keep completed but unpaid trips available for legitimate settlement.
- Scope every asynchronous route response to its request generation, exact
  active order and pickup/dropoff phase. Refresh immediately on leg change.
- Preserve legacy source statuses and all existing route rendering.

Files: `lib/features/driver/driver_shell.dart`,
`lib/features/driver/models/driver_shell_helpers.dart`, and
`test/driver_shell_helpers_test.dart` under `apps/mobile/smarttaxi_app`.

## Verification and limits

- Flutter analyze: no issues.
- Focused helper tests: 17 passed, including six new regression cases.
- Full Flutter suite: 50 passed.
- Native route annotation-to-style migration was deliberately not attempted.
- A physical Android device connected successfully, but both attempts to
  install the local debug build were rejected with
  `INSTALL_FAILED_USER_RESTRICTED`. The existing installation was not used
  for test orders because its API environment was not verified. Physical
  passenger/driver visual acceptance is still pending device-side approval.

No production accounts, payment providers or external SMS were used.
