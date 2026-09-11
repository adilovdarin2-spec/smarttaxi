# Web map, address and route visual pass — 2026-09-10

## Environment

- Fresh Docker web bundle: `http://127.0.0.1:5175`.
- API: local development stack on `http://127.0.0.1:4001`.
- Narrow 390 px application shell in the in-app browser.
- Local seed accounts and local development data only.

## Passenger evidence

- Pickup resolved to `улица Амангелды, 29, Атакент` after the location fallback.
- Destination search for `Кошкинбаева 29` returned the resolved house result,
  not a settlement, road or bare street.
- While the remote catalogue result was pending, the result region displayed
  `Ищем адреса …` and exposed its busy state instead of showing a false zero.
- Map selection at the centered real footprint resolved to `Амангелды улица,
  29` with the subtitle `В выбранном здании · Атакент`; confirmation was
  enabled only after that resolved building result existed.
- The 0.7 km route and both Economy/Delivery KZT tariffs rendered together.
  The compact preview used smaller endpoint copies, leaving the approved full
  64x86 picker marker unchanged and making the blue road line more readable.

## Driver evidence

A fresh guarded local CASH order was accepted in the live driver web UI and
visually followed through:

- incoming order;
- accepted trip card;
- navigator to pickup;
- arrived and waiting states;
- route to destination;
- completion and manual cash confirmation;
- no-active-trip recovery and return to `OFFLINE`.

The navigator used the server road geometry, changed its target after trip
start, kept labels above the building footprints and showed the explicit GPS
permission recovery state when browser geolocation was unavailable.

## Verification

- Web tests: 127/127 passed.
- Vite production build passed.
- Bundled MapLibre worker check passed.
- Docker services and API readiness remained healthy after the web rebuild.

This is browser evidence. Physical Android map/GPS/navigation acceptance still
requires the phone to appear in ADB.
