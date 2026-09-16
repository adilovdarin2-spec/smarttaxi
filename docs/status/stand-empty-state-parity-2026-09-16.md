# BaiSapar empty stand parity pass — 2026-09-16

## Confirmed defect

Both the Flutter passenger sheet and the web passenger dialog rendered the
instruction to call a driver even when the stand had no `BOARDING` vehicles.
The surrounding empty-state copy was correct, but the unconditional instruction
contradicted it and offered an impossible action.

## Fix

- Flutter renders `standCallToConfirm` only when at least one `BOARDING` entry
  is actually offered to the rider.
- Web applies the same `boarding.length > 0` rule.
- Regression coverage checks both the populated and empty Flutter states and
  guards the matching web condition.

No queue status or legacy state-machine value was removed. Cars waiting their
turn remain visible to the driver but are not offered as bookable cars to a
rider.

## Verification

- focused Flutter stand tests: 10/10 passed;
- complete Flutter test suite: 368/368 passed;
- `flutter analyze`: no issues;
- Android profile APK rebuilt and installed on a connected `2409BRN2CY`;
- corrected Myrzakent empty stand visually confirmed on that phone;
- web tests: 187/187 passed;
- web production build and MapLibre build guard passed;
- local Docker web image rebuilt without deleting volumes;
- corrected Myrzakent empty stand visually confirmed in the local built web
  application using the driver test account in passenger mode;
- Android logcat contained no Flutter or Android runtime exception after the
  physical check.

The Android artifact remains a local, debug-signed profile QA build. This pass
does not claim production SMS, payments, signing or official stand geometry.
