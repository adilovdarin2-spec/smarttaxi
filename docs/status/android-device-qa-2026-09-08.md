# Android physical-device QA — 2026-09-08

This pass used the connected Android phone and only the local Docker
development backend. It did not contact the production API, SMS provider, or
payment provider.

## Artifact

- Built `app-debug.apk` with `API_BASE_URL` and `SOCKET_URL` pointing to the
  host's local Docker API on the same Wi-Fi network.
- Installed the resulting debug APK over the existing local SmartTaxi app.
- Confirmed the app package launches on the phone.

## Confirmed native flow

- Welcome/login screen renders with the Russian language control, phone input,
  legal links, and a usable continue action.
- Local seeded client login completed against the local API.
- The native region confirmation detected Myrzakent from device location.
- The passenger home map rendered through native MapLibre; the current
  location reverse-resolved to a readable street-and-house address.
- A restored local smoke order displayed a native route (duration and
  distance) and the no-driver recovery screen. The test order was cancelled
  in the local QA database and the app returned to the clean passenger home.
- The native destination picker opens with region selection, an address/POI
  input, and map-point selection.

## Deliberate boundaries

- The APK is a development QA artifact. A release APK is blocked when the
  private upload keystore is absent; this is the expected signing safeguard
  and must not be bypassed.
- No production account, real SMS sender, payment merchant, or personal
  address was used.
- Exact building façades/roofs still depend on a licensed external 3D map-data
  provider. The app uses the available real map footprints and heights.
