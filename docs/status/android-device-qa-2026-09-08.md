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

## Extended passenger lifecycle on the physical phone

This follow-up used the same local Docker stack and local test accounts. The
phone remained on the debug APK configured for the local API/socket; no
production service or personal account was used.

- The passenger home showed a readable reverse-resolved pickup address,
  `улица Бектасова, 60, Мырзакент`, the compact square-tail pickup marker and
  real map footprints.
- The destination map picker showed the approved large square-tail selector,
  disabled confirmation while reverse lookup was pending, and enabled it only
  after a street-and-house result was returned. The previous pickup stayed
  visible as context while editing the destination.
- The phone created a local CASH order from the normal passenger UI. A local,
  region-approved driver then accepted it through the ordinary authenticated
  driver API flow. The passenger app updated itself from searching to
  `Водитель найден` without a manual refresh.
- On the physical native map, the route, finish flag and car were visible at
  useful scale. The street label remained legible over the route, and map
  geometry/markers respected the intended ordering: buildings behind labels,
  route and address markers.
- The passenger UI received the full local lifecycle: driver found, active
  trip, completed cash receipt and rating sheet. The receipt displayed the
  route summary, `700 ₸`, CASH and the correct disabled/enabled rating action.

The test order was stationary local QA data. It was completed and marked paid
only by the local development finance test role; no merchant transaction was
created. The final rating sheet is intentionally left open on the phone for
visual review.

## Extended driver lifecycle on the physical phone

This follow-up intentionally used a separate locally registered rider while
the phone was signed in as the seeded, region-approved driver. That verifies
the app-to-app dispatch path rather than treating an authenticated API request
as a substitute for the driver's UI.

- The driver signed in normally on the phone, selected Myrzakent, and moved
  from offline to online. Its current region and active geolocation were shown
  in the native line screen.
- A newly created local CASH order appeared in the driver's **Orders** tab
  without signing out or manually refreshing. The incoming card showed its
  price, route length/time, both street-and-house addresses, rider contact and
  accept/skip actions.
- The driver accepted the order and completed every native state: going to
  pickup, arrived, waiting, trip started, active trip, trip completed, cash
  received, optional rider rating and return to the no-active-trip screen.
- The full-screen driver navigator was visually inspected while the trip was
  active. It displayed a road-shaped 1.2 km route, next-turn instruction,
  ETA, destination marker, street labels, real building footprints and a
  compact vehicle marker. The route was below labels while the vehicle and
  destination stayed above the map geometry.

The order was local QA data and the cash-payment acknowledgement was only a
development state transition; no real money, merchant or production account
was involved.

## Deliberate boundaries

- The APK on the phone is a development QA artifact. A separately signed
  Android App Bundle is recorded in `release-qa-local-2026-09-08.md`; no
  bundle has been uploaded to a store.
- No production account, real SMS sender, payment merchant, or personal
  address was used.
- Exact building façades/roofs still depend on a licensed external 3D map-data
  provider. The app uses the available real map footprints and heights.
