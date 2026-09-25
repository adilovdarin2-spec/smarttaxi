# BaiSapar physical Android QA — 2026-09-15

## Environment

- Physical device: Xiaomi `2409BRN2CY`, Android 16, ADB serial
  `IBOVEMHQBQBQMJTS`; no emulator was used.
- Application ID / label: `kz.baisapar.app` / `BaiSapar`.
- Installed candidate: `1.0.0+2`, debug-signed, local-development endpoints.
- API/socket: `http://127.0.0.1:4001`; web: `http://127.0.0.1:5175` through
  explicit ADB reverse tunnels.
- Backend: isolated local Docker development stack only. Production accounts,
  production SMS and merchant flows were not used.

The APK was installed through the normal Android confirmation dialog after the
Xiaomi USB installer rejected direct ADB replacement. No device protection was
disabled or bypassed. Build number 2 was assigned so the phone could reliably
distinguish this candidate from the already-installed build number 1.

## Completed physical flow

The local driver account completed the real UI lifecycle against the local API:

1. sign in and select Myrzakent;
2. go online and receive an incoming CASH order;
3. accept, start driving to pickup, arrive and start waiting;
4. start the trip and open the full-screen navigator;
5. inspect the road-shaped route, turn instruction, ETA, compact vehicle marker,
   destination marker, buildings and readable map labels;
6. background the application with the Android Home action and resume it without
   losing the active trip;
7. complete the trip, confirm receipt of 700 KZT cash, rate the passenger and
   return to the empty-trip state.

The first exact local order was
`e401e2b3-f677-4fff-b7a2-fc96a60c66e7`. After installing build 2, the lifecycle
was repeated with `03b53d88-a234-439f-b634-66d19bb14a42`; the revised pickup
caption was visually confirmed in both arrived and waiting states. Final
database reads confirmed `status=PAID` and `payment_status=PAID`. The seed driver
was returned to `OFFLINE` after QA.

## Confirmed recovery and fixes

Disconnecting USB removed both ADB reverse tunnels. The first completion attempt
therefore failed with the honest connection message while the server retained
`TRIP_STARTED`; after the tunnel was restored, one UI retry advanced the order
to `TRIP_COMPLETED`. This confirms that an uncertain failure did not produce a
hidden duplicate transition.

The same condition exposed two presentation issues that are fixed in build 2:

- after `DRIVER_ARRIVED` and `WAITING_CLIENT`, the map caption now shows the
  actual pickup address instead of continuing to say "route to pickup";
- after a temporary location-publication failure, the next server-acknowledged
  GPS fix replaces the stale connection error with the active-location state.

On the installed build 2, port 4001 was deliberately removed while the driver
was online. The location card changed to the server-unavailable state. After the
tunnel was restored, a later acknowledged GPS publication changed it back to
the active-location state without restarting the application. The driver was
then taken offline normally.

The Android runtime location prompt was also opened after revoking the test
app's coarse/fine permission grants; it presented precise/approximate and
while-in-use/one-time/deny choices. Permission grants were restored after the
check. This establishes prompt presentation, not moving-GPS or denied-forever
acceptance.

## Candidate identity

- APK: `apps/mobile/smarttaxi_app/build/app/outputs/flutter-apk/app-debug.apk`
- Size: `233,210,724` bytes
- SHA-256: `6d0787b14c58468670ffd14a41f48e3c210f634a584d9e401efe1866ed3ddb6d`
- Android version: `versionName=1.0.0`, `versionCode=2`, target SDK 36
- Signature: APK Signature Scheme v2, one Android debug signer

This is a USB/local QA candidate, not a production or Play Store artifact.

## Verification

- Flutter analysis: no issues.
- Flutter tests: 328/328 passed.
- Focused driver trip-layout tests: 3/3 passed.
- Debug APK assembly: passed.
- Local readiness: PostgreSQL, Redis and OSRM ready; development SMS mode.
- Guarded Docker lifecycle smoke: passed before the physical run.

## Still external or field-only

- Firebase `google-services.json` for `kz.baisapar.app` and server credentials
  are required before a notification-capable release AAB can be produced.
- Production SMS sender approval/credentials, merchant approval/credentials,
  legal entity, final domain, store accounts and signing-key custody remain
  owner/external inputs.
- Official per-region address exports containing `rka`, `label`, `lat`, `lng`
  and a separate checksum `meta.json` remain unavailable. The Pavlodar workbook
  is not eligible and no missing houses were fabricated.
- Spoken guidance, denied-forever permission recovery and moving-GPS/on-road
  safety still require a controlled journey; a stationary desk test cannot
  honestly certify them.
- Real taxi-stand geometry and multi-driver operational acceptance remain field
  work. Public OSRM provides neither live traffic nor authoritative speed data.
