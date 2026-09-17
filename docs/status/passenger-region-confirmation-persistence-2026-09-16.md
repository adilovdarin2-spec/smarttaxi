# BaiSapar passenger region confirmation persistence — 2026-09-16

## Confirmed defect

The native passenger shell kept `_startupRegionPromptShown` only in widget
memory. As a result, the same detected region was confirmed again after every
cold application start, even when the rider had explicitly accepted it moments
before.

## Fix

- `AuthStore` now retains the last explicitly confirmed passenger region ID as
  a device-level display/location preference.
- The first detection still asks when multiple service regions exist.
- The same detected ID does not ask again on later cold starts.
- A different detected ID still requires a fresh confirmation.
- Explicit manual region selection updates the remembered ID.
- Secure-storage read/write failures fail safely: they never block location or
  address selection and may only cause the confirmation to be shown again.
- The preference deliberately survives logout, like locale, theme and navigator
  voice preferences; it contains only a public service-region identifier.

## Verification

- focused startup tests: 7/7 passed, including first detection, same-region,
  changed-region and single-region cases;
- complete Flutter suite: 372/372 passed;
- `flutter analyze`: no issues;
- profile APK rebuilt and installed on connected Android device `2409BRN2CY`;
- first cold launch showed `Ваш регион: Мырзакент?` as expected;
- after accepting, the second cold launch opened the passenger home directly
  with region `Мырзакент` and no repeated confirmation;
- second cold activity launch completed in 2.124 seconds.

The installed package remains a local, debug-signed profile QA build connected
to the isolated development Docker stack through ADB reverse.
